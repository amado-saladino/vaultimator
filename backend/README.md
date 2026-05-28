# Vaultimator

Vaultimator is a local-first alternative to Bitwarden, focusing on extreme security and simplicity.

## Features

- Complete local data control
- Master password hashing via **Argon2id**
- AES-256-GCM data encryption
- Secure session tokens
- Highly customizable password generator

## Prerequisites

- Go 1.22 or higher

## Setup Instructions

1. **Clone/Navigate to Backend Directory:**
   ```bash
   cd backend
   ```

2. **Download Dependencies:**
   ```bash
   go mod tidy
   ```

3. **Run the Server:**
   ```bash
   go run main.go
   ```
   *This will create a `config.yaml` with default settings upon first run.*

## API Endpoints

- `GET /api/status`: Checks if the master password has been set.
- `POST /api/setup`: Sets the master password (requires `{"password": "..."}`).
- `POST /api/login`: Validates the master password and returns a session token (requires `{"password": "..."}`).
- `POST /api/generate`: Generates a random password.
- `GET /api/data`: Returns the decrypted vault data (Requires `Authorization: Bearer <token>`).
- `PUT /api/data`: Updates the encrypted vault data (Requires `Authorization: Bearer <token>`).
- `POST /api/destroy`: Permanently deletes the data file and master hash (Requires `Authorization: Bearer <token>` and `{"password": "..."}`).

## Development Notes
- The vault data structure contains `folders`, `passwords`, and `secret_notes`.
- All updates overwrite the existing `data_file_name` completely, meaning the client is responsible for sending the full modified state.
