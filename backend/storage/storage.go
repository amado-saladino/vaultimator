package storage

import (
	"encoding/json"
	"errors"
	"os"
	"strings"

	"vaultimator/backend/crypto"
	"vaultimator/backend/models"
)

// ReadMasterHash reads the master hash string from the given filename
func ReadMasterHash(filename string) (string, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil // Not set yet
		}
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

// WriteMasterHash writes the master hash to the given filename
func WriteMasterHash(filename, hash string) error {
	return os.WriteFile(filename, []byte(hash), 0600)
}

// ReadVaultData reads, decrypts, and unmarshals the vault data
func ReadVaultData(filename string, key []byte) (*models.VaultData, error) {
	encryptedData, err := os.ReadFile(filename)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty vault data if file doesn't exist
			return &models.VaultData{}, nil
		}
		return nil, err
	}

	decryptedData, err := crypto.Decrypt(encryptedData, key)
	if err != nil {
		return nil, errors.New("failed to decrypt data, invalid key or corrupted file")
	}

	var vaultData models.VaultData
	if err := json.Unmarshal(decryptedData, &vaultData); err != nil {
		return nil, err
	}

	return &vaultData, nil
}

// WriteVaultData marshals, encrypts, and writes the vault data
func WriteVaultData(filename string, key []byte, vaultData *models.VaultData) error {
	jsonData, err := json.Marshal(vaultData)
	if err != nil {
		return err
	}

	encryptedData, err := crypto.Encrypt(jsonData, key)
	if err != nil {
		return err
	}

	return os.WriteFile(filename, encryptedData, 0600)
}

// DestroyAllData deletes the master hash and data files
func DestroyAllData(masterFile, dataFile string) error {
	var errs []error
	if err := os.Remove(masterFile); err != nil && !os.IsNotExist(err) {
		errs = append(errs, err)
	}
	if err := os.Remove(dataFile); err != nil && !os.IsNotExist(err) {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return errors.New("failed to delete some files")
	}
	return nil
}
