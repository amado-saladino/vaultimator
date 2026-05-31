package crypto

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/pbkdf2"
)

// Argon2 parameters
const (
	saltSize    = 16
	memory      = 64 * 1024
	iterations  = 3
	parallelism = 2
	keyLength   = 32
)

// HashPassword generates an Argon2id hash of a password with a random salt.
// It returns a base64-encoded string combining the salt and the hash.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltSize)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, keyLength)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, memory, iterations, parallelism, b64Salt, b64Hash), nil
}

// ExtractSalt parses the Argon2id hash string and returns the salt.
func ExtractSalt(encodedHash string) ([]byte, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return nil, errors.New("invalid hash format")
	}
	return base64.RawStdEncoding.DecodeString(parts[4])
}

// VerifyPassword checks if the provided password matches the Argon2id hash.
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false, errors.New("invalid hash format")
	}

	var version int
	_, err := fmt.Sscanf(parts[2], "v=%d", &version)
	if err != nil {
		return false, err
	}
	if version != argon2.Version {
		return false, errors.New("incompatible version of argon2")
	}

	var mem, iters uint32
	var parallel uint8
	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &iters, &parallel)
	if err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}

	decodedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	hashToVerify := argon2.IDKey([]byte(password), salt, iters, mem, parallel, uint32(len(decodedHash)))

	if subtleConstantTimeCompare(decodedHash, hashToVerify) == 1 {
		return true, nil
	}
	return false, nil
}

// subtleConstantTimeCompare performs a constant time comparison
func subtleConstantTimeCompare(x, y []byte) int {
	if len(x) != len(y) {
		return 0
	}
	var v byte
	for i := 0; i < len(x); i++ {
		v |= x[i] ^ y[i]
	}
	if v == 0 {
		return 1
	}
	return 0
}

// DeriveKey derives a 32-byte AES-256 encryption key from the master password using a salt.
// The same salt MUST be used for subsequent derivations to retrieve the same key.
func DeriveKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, 32)
}

// DeriveKeyPortable derives a 32-byte encryption key using PBKDF2 with a fixed salt.
// This allows the same password to produce the same key on any node (for cross-node backups).
// DO NOT change this function or the salt - it will break all existing portable backups!
func DeriveKeyPortable(password string) []byte {
	// Fixed salt for portable backups - MUST NEVER CHANGE
	// This salt is used consistently across all nodes for backup encryption
	fixedSalt := []byte("vaultimator-backup-portable-salt-v1")
	
	// PBKDF2 with SHA-256: 100,000 iterations
	// This ensures the same password produces the same key on any node
	return pbkdf2.Key([]byte(password), fixedSalt, 100000, 32, sha256.New)
}

// ValidateMasterPassword enforces strong password requirements:
// minimum 12 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character.
func ValidateMasterPassword(password string) error {
	if len(password) < 12 {
		return errors.New("password must be at least 12 characters long")
	}

	var hasUpper, hasLower, hasNumber, hasSpecial bool

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper {
		return errors.New("password must contain at least one uppercase letter")
	}
	if !hasLower {
		return errors.New("password must contain at least one lowercase letter")
	}
	if !hasNumber {
		return errors.New("password must contain at least one number")
	}
	if !hasSpecial {
		return errors.New("password must contain at least one special character")
	}

	return nil
}
