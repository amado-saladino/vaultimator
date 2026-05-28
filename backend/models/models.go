package models

import (
	"time"

	"github.com/google/uuid"
)

// VaultData represents the root structure of the encrypted JSON file
type VaultData struct {
	Folders     []Folder       `json:"folders"`
	Passwords   []PasswordItem `json:"passwords"`
	SecretNotes []SecretNote   `json:"secret_notes"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// Folder represents a group for passwords and notes
type Folder struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PasswordItem represents a single set of credentials
type PasswordItem struct {
	ID        string    `json:"id"`
	FolderID  string    `json:"folder_id"` // can be empty if unassigned
	Title     string    `json:"title"`
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	Website   string    `json:"website"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SecretNote represents a standalone secret text note
type SecretNote struct {
	ID        string    `json:"id"`
	FolderID  string    `json:"folder_id"` // can be empty if unassigned
	Title     string    `json:"title"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// NewFolder creates a new folder with a generated UUID
func NewFolder(name string) Folder {
	now := time.Now()
	return Folder{
		ID:        uuid.New().String(),
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// NewPasswordItem creates a new password item with a generated UUID
func NewPasswordItem(folderID, title, username, password, website, note string) PasswordItem {
	now := time.Now()
	return PasswordItem{
		ID:        uuid.New().String(),
		FolderID:  folderID,
		Title:     title,
		Username:  username,
		Password:  password,
		Website:   website,
		Note:      note,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// NewSecretNote creates a new secret note with a generated UUID
func NewSecretNote(folderID, title, note string) SecretNote {
	now := time.Now()
	return SecretNote{
		ID:        uuid.New().String(),
		FolderID:  folderID,
		Title:     title,
		Note:      note,
		CreatedAt: now,
		UpdatedAt: now,
	}
}
