package api

import (
	"crypto/rand"
	"encoding/base64"
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
	Config   *config.AppConfig
	Sessions map[string]Session
	mu       sync.Mutex
}

func NewApp(cfg *config.AppConfig) *App {
	return &App{
		Config:   cfg,
		Sessions: make(map[string]Session),
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
	mux.HandleFunc("/api/login", a.HandleLogin)
	mux.HandleFunc("/api/generate", a.HandleGeneratePassword)
	mux.HandleFunc("/api/export", a.HandleExport)
	mux.HandleFunc("/api/import", a.HandleImport)
	mux.HandleFunc("/api/change-password", a.HandleChangePassword)

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

// HandleLogin verifies the master password and returns a session token
func (a *App) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

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

	key := crypto.DeriveKey(req.Password, salt)
	token := CreateToken()

	a.mu.Lock()
	a.Sessions[token] = Session{
		Key:       key,
		ExpiresAt: time.Now().Add(time.Duration(a.Config.Security.SessionDurationMinutes) * time.Minute),
	}
	a.mu.Unlock()

	sendJSON(w, http.StatusOK, map[string]string{"token": token})
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

// HandleGeneratePassword handles password generation
func (a *App) HandleGeneratePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var opts crypto.GeneratePasswordOptions
	if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
		// use defaults if payload is empty or invalid
	}

	password, err := crypto.GeneratePassword(opts)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to generate password")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"password": password})
}

// HandleDestroy wipes all data
func (a *App) HandleDestroy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Double check password for destruction as requested
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	hash, _ := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	valid, err := crypto.VerifyPassword(req.Password, hash)
	if err != nil || !valid {
		sendError(w, http.StatusUnauthorized, "Invalid master password")
		return
	}

	// clear sessions
	a.mu.Lock()
	a.Sessions = make(map[string]Session)
	a.mu.Unlock()

	if err := storage.DestroyAllData(a.Config.Storage.MasterPasswordFileName, a.Config.Storage.DataFileName); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to destroy some files")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"message": "All data destroyed successfully"})
}

// HandleExport exports encrypted backup file using a separate passphrase
func (a *App) HandleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		MasterPassword string `json:"master_password"`
		Passphrase     string `json:"passphrase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.MasterPassword == "" {
		sendError(w, http.StatusBadRequest, "Master password is required")
		return
	}

	if req.Passphrase == "" {
		sendError(w, http.StatusBadRequest, "Backup passphrase is required")
		return
	}

	// Verify master password against stored hash
	hash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to verify password")
		return
	}

	valid, err := crypto.VerifyPassword(req.MasterPassword, hash)
	if err != nil || !valid {
		sendError(w, http.StatusUnauthorized, "Invalid master password")
		return
	}

	// Extract salt from master password hash and derive key to read vault
	salt, err := crypto.ExtractSalt(hash)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to extract salt")
		return
	}

	// Derive key from master password to decrypt vault data
	vaultKey := crypto.DeriveKey(req.MasterPassword, salt)

	// Read vault data (decrypted with master password key)
	vaultData, err := storage.ReadVaultData(a.Config.Storage.DataFileName, vaultKey)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to read vault data")
		return
	}

	// Create backup structure with metadata
	backup := map[string]interface{}{
		"version":     "1.0",
		"exported_at": time.Now().UTC().Format(time.RFC3339),
		"vault_data":  vaultData,
	}

	// Marshal backup to JSON
	backupJSON, err := json.Marshal(backup)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to marshal backup")
		return
	}

	// Derive portable backup encryption key from passphrase (not master password)
	// This allows same backup to be imported on any node with same passphrase
	backupKey := crypto.DeriveKeyPortable(req.Passphrase)

	// Encrypt entire backup with portable passphrase key
	encryptedBackup, err := crypto.Encrypt(backupJSON, backupKey)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to encrypt backup")
		return
	}

	// Send as binary encrypted file
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="vaultimator-backup-encrypted.vault"`)
	w.WriteHeader(http.StatusOK)
	w.Write(encryptedBackup)
}

// HandleImport imports encrypted backup and saves vault data
func (a *App) HandleImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		MasterPassword string `json:"master_password"`
		Passphrase     string `json:"passphrase"`
		EncryptedData  string `json:"encrypted_data"` // Base64 encoded encrypted backup
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.MasterPassword == "" {
		sendError(w, http.StatusBadRequest, "Master password is required")
		return
	}

	if req.Passphrase == "" {
		sendError(w, http.StatusBadRequest, "Backup passphrase is required")
		return
	}

	if req.EncryptedData == "" {
		sendError(w, http.StatusBadRequest, "Encrypted data is required")
		return
	}

	// Verify master password
	hash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to verify password")
		return
	}

	valid, err := crypto.VerifyPassword(req.MasterPassword, hash)
	if err != nil || !valid {
		sendError(w, http.StatusUnauthorized, "Invalid master password")
		return
	}

	// Extract salt from master password hash and derive key to write vault
	salt, err := crypto.ExtractSalt(hash)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to extract salt")
		return
	}

	// Derive key from master password to encrypt vault data with current password
	vaultKey := crypto.DeriveKey(req.MasterPassword, salt)

	// Decode base64 encrypted data
	encryptedBackup, err := base64.StdEncoding.DecodeString(req.EncryptedData)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid encrypted data format")
		return
	}

	// Derive portable key from passphrase to decrypt backup
	backupKey := crypto.DeriveKeyPortable(req.Passphrase)

	// Decrypt backup with passphrase
	decryptedBackup, err := crypto.Decrypt(encryptedBackup, backupKey)
	if err != nil {
		sendError(w, http.StatusUnauthorized, "Failed to decrypt backup - invalid passphrase or corrupted file")
		return
	}

	// Parse backup JSON
	var backup map[string]interface{}
	if err := json.Unmarshal(decryptedBackup, &backup); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid backup file format")
		return
	}

	// Validate backup structure
	if _, ok := backup["version"]; !ok {
		sendError(w, http.StatusBadRequest, "Invalid backup file - missing version")
		return
	}

	// Extract vault data
	vaultDataRaw, ok := backup["vault_data"]
	if !ok {
		sendError(w, http.StatusBadRequest, "Invalid backup file - missing vault_data")
		return
	}

	// Marshal vault data back to JSON and unmarshal to VaultData struct
	vaultDataJSON, err := json.Marshal(vaultDataRaw)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid vault_data in backup")
		return
	}

	var vaultData models.VaultData
	if err := json.Unmarshal(vaultDataJSON, &vaultData); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid vault data structure")
		return
	}

	// Save imported vault data (encrypted with current master password)
	vaultData.UpdatedAt = time.Now()
	if err := storage.WriteVaultData(a.Config.Storage.DataFileName, vaultKey, &vaultData); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to save imported data")
		return
	}

	// Create a new session for the user
	token := CreateToken()
	a.mu.Lock()
	a.Sessions[token] = Session{
		Key:       vaultKey,
		ExpiresAt: time.Now().Add(time.Duration(a.Config.Security.SessionDurationMinutes) * time.Minute),
	}
	a.mu.Unlock()

	sendJSON(w, http.StatusOK, map[string]string{
		"message": "Backup imported successfully",
		"token":   token,
	})
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

	// Validate new password strength
	if err := crypto.ValidateMasterPassword(req.NewPassword); err != nil {
		sendError(w, http.StatusBadRequest, "New password: "+err.Error())
		return
	}

	// Verify current password
	oldHash, err := storage.ReadMasterHash(a.Config.Storage.MasterPasswordFileName)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to verify password")
		return
	}

	valid, err := crypto.VerifyPassword(req.CurrentPassword, oldHash)
	if err != nil || !valid {
		sendError(w, http.StatusUnauthorized, "Invalid current password")
		return
	}

	// Extract salt and derive key to read vault data
	oldSalt, err := crypto.ExtractSalt(oldHash)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to extract salt")
		return
	}

	oldKey := crypto.DeriveKey(req.CurrentPassword, oldSalt)

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
