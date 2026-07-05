package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"vaultimator/backend/config"
	"vaultimator/backend/crypto"
	"vaultimator/backend/logger"
	"vaultimator/backend/models"
	"vaultimator/backend/storage"
)

// Session holds the derived decryption key and expiration time
type Session struct {
	Key       []byte
	ExpiresAt time.Time
}

// App holds the application state and dependencies
type App struct {
	Config        *config.AppConfig
	Sessions      map[string]Session
	RefreshTokens map[string]Session
	mu            sync.Mutex
}

func NewApp(cfg *config.AppConfig) *App {
	return &App{
		Config:        cfg,
		Sessions:      make(map[string]Session),
		RefreshTokens: make(map[string]Session),
	}
}

func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		json.NewEncoder(w).Encode(data)
	}
}

func sendError(w http.ResponseWriter, status int, message string) {
	if status >= 500 {
		logger.SafeLogError("Internal Server Error: %s", message)
	} else {
		logger.SafeLogInfo("Client Error (%d): %s", status, message)
	}
	sendJSON(w, status, map[string]string{"error": message})
}

// CreateToken generates a secure random token
func CreateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// SetupRoutes registers the HTTP routes
func (a *App) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/status", a.HandleStatus)
	mux.HandleFunc("/api/setup", a.HandleSetup)
	mux.HandleFunc("/api/token", a.HandleToken) // Replaces login
	mux.HandleFunc("/api/change-password", a.requireAuth(a.HandleChangePassword))

	// Protected routes
	mux.HandleFunc("/api/data", a.requireAuth(a.HandleData))
	mux.HandleFunc("/api/destroy", a.requireAuth(a.HandleDestroy))
}

// requireAuth is a middleware to check session token
func (a *App) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			sendError(w, http.StatusUnauthorized, "Missing or invalid token")
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")

		a.mu.Lock()
		session, exists := a.Sessions[token]
		if !exists || time.Now().After(session.ExpiresAt) {
			delete(a.Sessions, token) // Clean up expired session
			a.mu.Unlock()
			sendError(w, http.StatusUnauthorized, "Session expired or invalid")
			return
		}

		// Extend session
		session.ExpiresAt = time.Now().Add(time.Duration(a.Config.Security.SessionDurationMinutes) * time.Minute)
		a.Sessions[token] = session
		a.mu.Unlock()

		// Pass the session key to the request context or just assume handler uses the token
		// For simplicity, we can set it in a custom header (internally) or just let handlers look it up again
		// Here, we'll let handlers look it up using the token.
		next.ServeHTTP(w, r)
	}
}

// HandleStatus returns whether the vault is initialized
func (a *App) HandleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	hash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to read master hash")
		return
	}

	sendJSON(w, http.StatusOK, map[string]bool{"initialized": hash != ""})
}

// HandleSetup sets the initial master password
func (a *App) HandleSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	hash, _ := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if hash != "" {
		sendError(w, http.StatusBadRequest, "Vault is already initialized")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := crypto.ValidateMasterPassword(req.Password); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	newHash, err := crypto.HashPassword(req.Password)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	if err := storage.WriteMasterHash(a.Config.Storage.MasterPasswordFileName, newHash); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to save master password")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"message": "Master password set successfully"})
}

// HandleToken verifies the master password or refresh token and returns session tokens
func (a *App) HandleToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		GrantType    string `json:"grant_type"`
		Password     string `json:"password,omitempty"`
		RefreshToken string `json:"refresh_token,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var key []byte

	if req.GrantType == "password" {
		hash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
		if err != nil || hash == "" {
			sendError(w, http.StatusBadRequest, "Vault is not initialized")
			return
		}

		valid, err := crypto.VerifyPassword(req.Password, hash)
		if err != nil || !valid {
			sendError(w, http.StatusUnauthorized, "Invalid master password")
			return
		}

		salt, err := crypto.ExtractSalt(hash)
		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to extract salt")
			return
		}

		key = crypto.DeriveKey(req.Password, salt)
	} else if req.GrantType == "refresh_token" {
		if req.RefreshToken == "" {
			sendError(w, http.StatusBadRequest, "Refresh token is required")
			return
		}

		a.mu.Lock()
		session, exists := a.RefreshTokens[req.RefreshToken]
		a.mu.Unlock()

		if !exists || time.Now().After(session.ExpiresAt) {
			sendError(w, http.StatusUnauthorized, "Invalid or expired refresh token")
			return
		}

		key = session.Key
	} else {
		sendError(w, http.StatusBadRequest, "Invalid grant_type")
		return
	}

	accessToken := CreateToken()
	refreshToken := CreateToken()

	a.mu.Lock()
	// Optionally remove old refresh token if grant_type == refresh_token, but keeping it simple for now
	if req.GrantType == "refresh_token" {
		delete(a.RefreshTokens, req.RefreshToken)
	}

	a.Sessions[accessToken] = Session{
		Key:       key,
		ExpiresAt: time.Now().Add(time.Duration(a.Config.Security.SessionDurationMinutes) * time.Minute),
	}
	a.RefreshTokens[refreshToken] = Session{
		Key:       key,
		ExpiresAt: time.Now().Add(time.Duration(a.Config.Security.SessionDurationMinutes) * 10 * time.Minute), // Refresh token lives 10x longer
	}
	a.mu.Unlock()

	sendJSON(w, http.StatusOK, map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

// HandleData handles getting and updating the entire vault data.
func (a *App) HandleData(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	a.mu.Lock()
	key := a.Sessions[token].Key
	a.mu.Unlock()

	if r.Method == http.MethodGet {
		data, err := storage.ReadVaultData(a.Config.Storage.DataFileName, key)
		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to read vault data")
			return
		}
		sendJSON(w, http.StatusOK, data)
		return
	}

	if r.Method == http.MethodPut {
		var req models.VaultData
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, http.StatusBadRequest, "Invalid request body")
			return
		}
		req.UpdatedAt = time.Now()

		if err := storage.WriteVaultData(a.Config.Storage.DataFileName, key, &req); err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to save vault data")
			return
		}
		sendJSON(w, http.StatusOK, map[string]string{"message": "Data saved successfully"})
		return
	}

	sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
}


// HandleDestroy wipes all data
func (a *App) HandleDestroy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		MasterPassword string `json:"master_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.MasterPassword == "" {
		sendError(w, http.StatusBadRequest, "Master password is required")
		return
	}

	// Verify master password before destroying anything
	hash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if err != nil || hash == "" {
		sendError(w, http.StatusInternalServerError, "Failed to read master hash")
		return
	}
	valid, err := crypto.VerifyPassword(req.MasterPassword, hash)
	if err != nil || !valid {
		sendError(w, http.StatusUnauthorized, "Invalid master password")
		return
	}

	// Clear sessions
	a.mu.Lock()
	a.Sessions = make(map[string]Session)
	a.RefreshTokens = make(map[string]Session)
	a.mu.Unlock()

	if err := storage.DestroyAllData(a.Config.Storage.MasterPasswordFileName, a.Config.Storage.DataFileName); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to destroy some files")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"message": "All data destroyed successfully"})
}

// HandleChangePassword changes the master password
func (a *App) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.CurrentPassword == "" {
		sendError(w, http.StatusBadRequest, "Current password is required")
		return
	}

	if req.NewPassword == "" {
		sendError(w, http.StatusBadRequest, "New password is required")
		return
	}

	// Verify the current master password
	storedHash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if err != nil || storedHash == "" {
		sendError(w, http.StatusInternalServerError, "Failed to read master hash")
		return
	}
	valid, err := crypto.VerifyPassword(req.CurrentPassword, storedHash)
	if err != nil || !valid {
		sendError(w, http.StatusUnauthorized, "Invalid current password")
		return
	}

	// Validate new password strength
	if err := crypto.ValidateMasterPassword(req.NewPassword); err != nil {
		sendError(w, http.StatusBadRequest, "New password: "+err.Error())
		return
	}

	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	a.mu.Lock()
	oldKey := a.Sessions[token].Key
	a.mu.Unlock()

	// Read vault data with old key
	vaultData, err := storage.ReadVaultData(a.Config.Storage.DataFileName, oldKey)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to read vault data")
		return
	}

	// Hash new password
	newHash, err := crypto.HashPassword(req.NewPassword)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to hash new password")
		return
	}

	// Extract new salt and derive new key
	newSalt, err := crypto.ExtractSalt(newHash)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to extract new salt")
		return
	}

	newKey := crypto.DeriveKey(req.NewPassword, newSalt)

	// Re-encrypt vault data with new key
	vaultData.UpdatedAt = time.Now()
	if err := storage.WriteVaultData(a.Config.Storage.DataFileName, newKey, vaultData); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to save vault data")
		return
	}

	// Save new password hash
	if err := storage.WriteMasterHash(a.Config.Storage.MasterPasswordFileName, newHash); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to save new password hash")
		return
	}

	// Invalidate all existing sessions
	a.mu.Lock()
	a.Sessions = make(map[string]Session)
	a.mu.Unlock()

	sendJSON(w, http.StatusOK, map[string]string{
		"message": "Master password changed successfully. Please log in again.",
	})
}
