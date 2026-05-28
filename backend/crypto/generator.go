package crypto

import (
	"crypto/rand"
	"math/big"
)

const (
	lowerCharSet   = "abcdefghijklmnopqrstuvwxyz"
	upperCharSet   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	numberCharSet  = "0123456789"
	specialCharSet = "!@#$%^&*()-_=+[]{}|;:,.<>?"
)

// GeneratePasswordOptions holds options for generating a random password
type GeneratePasswordOptions struct {
	Length         int  `json:"length"`
	IncludeUpper   bool `json:"include_upper"`
	IncludeLower   bool `json:"include_lower"`
	IncludeNumbers bool `json:"include_numbers"`
	IncludeSpecial bool `json:"include_special"`
}

// GeneratePassword generates a random password based on the provided options
func GeneratePassword(opts GeneratePasswordOptions) (string, error) {
	if opts.Length <= 0 {
		opts.Length = 16
	}

	charSet := ""
	if opts.IncludeLower {
		charSet += lowerCharSet
	}
	if opts.IncludeUpper {
		charSet += upperCharSet
	}
	if opts.IncludeNumbers {
		charSet += numberCharSet
	}
	if opts.IncludeSpecial {
		charSet += specialCharSet
	}

	// Default to all if nothing selected
	if charSet == "" {
		charSet = lowerCharSet + upperCharSet + numberCharSet + specialCharSet
		opts.IncludeLower = true
		opts.IncludeUpper = true
		opts.IncludeNumbers = true
		opts.IncludeSpecial = true
	}

	password := make([]byte, opts.Length)
	for i := 0; i < opts.Length; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(charSet))))
		if err != nil {
			return "", err
		}
		password[i] = charSet[idx.Int64()]
	}

	return string(password), nil
}
