# Vaultimator - Self-Hosted Password Manager

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)
![Go](https://img.shields.io/badge/go-1.21+-blue.svg)
![React](https://img.shields.io/badge/react-18+-blue.svg)

Vaultimator is a **secure, self-hosted password manager** designed for users who want complete control over their sensitive data. Built with Go backend and React frontend, it provides enterprise-grade encryption while remaining simple to deploy and operate.

## 🌟 Key Features

- **✅ Self-Hosted:** Run entirely on your own infrastructure
- **✅ Zero-Knowledge:** No cloud sync, no third parties
- **✅ Portable Backups:** Export and import across nodes
- **✅ Cross-Node Support:** Share vaults between different servers
- **✅ Folder Organization:** Organize passwords and notes into folders
- **✅ Master Password Management:** Change password anytime
- **✅ Enterprise Encryption:** AES-256-CBC with Argon2id hashing
- **✅ Session Management:** Auto-logout, configurable timeout
- **✅ Password Generator:** Secure random password generation
- **✅ Secret Notes:** Store encrypted notes alongside passwords

---

## 📋 Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Browser                            │
│                  (Chrome, Firefox, Safari)                  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS/HTTP
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  Nginx Reverse Proxy                        │
│              Port 80 (or custom port)                       │
│    - Static asset serving (React frontend)                  │
│    - API request routing                                    │
│    - Gzip compression                                       │
│    - SSL termination (optional)                             │
└────────────────────────┬────────────────────────────────────┘
                         │ Internal Network
                         ↓
        ┌────────────────────────────────┐
        │    Frontend Container          │
        │  React 18 + Vite               │
        │  - Dashboard                   │
        │  - Password Management         │
        │  - Settings                    │
        │  - Folder Organization         │
        └────────────────────────────────┘
                         │
        ┌────────────────────────────────┐
        │    Backend Container           │
        │  Go 1.21+                      │
        │  - REST API (port 8080)        │
        │  - Encryption/Decryption       │
        │  - Session Management          │
        │  - Password Hashing            │
        │  - Data Persistence            │
        └────────────────────────────────┘
                         │
        ┌────────────────────────────────┐
        │    Data Storage                │
        │  Docker Volume                 │
        │  - vault_data.enc (encrypted)  │
        │  - master.hash (password hash) │
        │  - logs/                       │
        └────────────────────────────────┘
```

### Data Flow

#### Login Flow
```
1. User enters master password
2. Frontend sends to backend: POST /api/login
3. Backend verifies against stored Argon2 hash
4. If valid: Backend creates session + derives encryption key
5. Session token returned to frontend
6. Token stored in browser localStorage
7. Token used for all subsequent API requests
```

#### Encryption Flow (At Rest)
```
Master Password
    ↓
Argon2id Hashing → Password Hash (stored in master.hash)
    ↓
Extract Salt from Hash
    ↓
PBKDF2 Key Derivation → 256-bit Encryption Key
    ↓
AES-256-CBC Encryption → vault_data.enc (encrypted)
```

#### Backup/Export Flow
```
User exports backup:
  1. Enters Master Password → Verify & unlock vault
  2. Enters Backup Passphrase → Portable key
  3. Read vault (decrypt with master key)
  4. Create backup JSON with metadata
  5. Encrypt entire backup (with portable passphrase key)
  6. Download .vault file (binary encrypted data)
```

#### Backup/Import Flow
```
User imports backup:
  1. Select .vault file
  2. Enter Master Password → Verify THIS node
  3. Enter Backup Passphrase → Same as original export
  4. Decrypt backup (portable key works!)
  5. Validate backup structure
  6. Re-encrypt vault data (with THIS node's master key)
  7. Save to THIS node's storage
```

---

## 🔐 Security Architecture

### Encryption Algorithms

#### Master Password Hashing: Argon2id
```
Purpose: Hash master password for verification
Configuration:
  - Algorithm: Argon2id (memory-hard, GPU-resistant)
  - Time Cost: 2 iterations
  - Memory Cost: 19 MB
  - Parallelism: 1 thread
  - Output: 32-byte hash

Why Argon2id?
  ✓ Memory-hard (resists GPU/ASIC attacks)
  ✓ NIST recommended
  ✓ Slow (prevents brute force)
  ✓ Industry standard
```

#### Vault Data Encryption: AES-256-CBC
```
Purpose: Encrypt all vault data at rest
Configuration:
  - Algorithm: AES (Advanced Encryption Standard)
  - Key Size: 256 bits (32 bytes)
  - Mode: CBC (Cipher Block Chaining)
  - IV: 128 bits (random per encryption)
  - Padding: PKCS7

Why AES-256-CBC?
  ✓ Military-grade encryption
  ✓ NIST approved
  ✓ Fast and efficient
  ✓ Industry standard
```

#### Key Derivation: PBKDF2-SHA256
```
Purpose: Derive encryption key from master password
Configuration:
  - Algorithm: PBKDF2 with SHA-256
  - Iterations: 100,000 (for backups with fixed salt)
  - Salt: Extracted from Argon2 hash (unique per node)
  - Output: 256-bit key

Why PBKDF2?
  ✓ NIST approved
  ✓ Deterministic (same password = same key)
  ✓ Slow iterations prevent brute force
  ✓ Industry standard
```

### Data Security Model

#### Layer 1: Password Hashing
```
Master Password → Argon2id → Hash → Stored in master.hash
                               ↓
                          Node-specific salt
                          (unique per instance)
```

#### Layer 2: Key Derivation
```
Master Password + Unique Salt → PBKDF2 → 256-bit Key
                                            ↓
                                    Unlocks vault data
```

#### Layer 3: Data Encryption
```
Vault Data → AES-256-CBC → Encrypted Binary → vault_data.enc
            (with derived key)
```

### Backup Encryption Model

#### Export
```
Master Password (node-specific) → Verify & unlock vault
Backup Passphrase (portable) → Fixed salt → PBKDF2 → Backup key
                                                        ↓
Vault Data → AES-256-CBC → Encrypted Backup → .vault file
```

#### Import
```
.vault file → AES-256-CBC → Vault Data
          (with backup key from same passphrase)
                                ↓
                    Re-encrypt with THIS node's master key
                                ↓
                    Save to THIS node's storage
```

### What Gets Encrypted?

✅ **Encrypted:**
- All passwords
- All secret notes
- Folder names
- Website URLs
- Usernames
- Notes content

❌ **Not Encrypted (Storage):**
- Master password hash (salted, hashed)
- Session tokens (temporary, in-memory)
- Application logs (configurable)

---

## 🔑 Password Types in Vaultimator

### 1. Master Password
```
Purpose: Unlock vault on THIS node
Scope: Node-specific
Salt: Random, unique per node (Argon2id)
Key Derivation: PBKDF2 with unique salt
Usage: Login, vault access, vault encryption

Characteristics:
  - Must be 12+ characters
  - Should include uppercase, lowercase, numbers, symbols
  - Different master password per node is OK
  - Changing it re-encrypts entire vault
  - Forgetting it means vault is inaccessible
```

### 2. Backup Passphrase
```
Purpose: Encrypt/decrypt backup files
Scope: Portable (same across all nodes)
Salt: Fixed (never changes)
Key Derivation: PBKDF2-SHA256 with 100,000 iterations
Usage: Backup encryption/decryption

Characteristics:
  - Independent of master password
  - Same passphrase works on any node
  - Use to share backups across nodes
  - Different from master password (but can be same)
  - Forgetting it means backup cannot be decrypted
```

### 3. Stored Passwords
```
Purpose: Credentials for external services
Scope: Encrypted within vault
Encryption: AES-256-CBC (with vault key)
Key: Derived from master password

Characteristics:
  - Encrypted while at rest
  - Encrypted during transmission (HTTPS recommended)
  - Decrypted only in memory for use
  - Never logged
  - Searchable after login
```

### Relationships

```
Master Password ──[Argon2id]──> Hash (stored)
                     ↓
                  Unique Salt
                     ↓
Master Password ──[PBKDF2]──> Vault Key
                     ↓
         [AES-256-CBC Encryption]
                     ↓
              Vault Data (encrypted)
                Passwords, Notes, etc.

Backup Passphrase ──[PBKDF2]──> Backup Key
                  (fixed salt)
                     ↓
         [AES-256-CBC Encryption]
                     ↓
              Backup File (.vault)
```

---

## 🚀 Deployment with Docker Compose

### Prerequisites

```bash
# Required
- Docker 20.10+
- Docker Compose 2.0+
- 512 MB RAM (minimum)
- 1 GB disk space (minimum)
```

### Quick Start (3 minutes)

#### 1. Build Images
```bash
docker-compose build
```

#### 2. Start Containers
```bash
docker-compose up -d
```

#### 3. Access Application
```
Browser: http://localhost
Backend: http://localhost:8080/api/status
```

### Common Docker Compose Commands

```bash
# Build images
docker-compose build

# Start containers
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop containers
docker-compose stop

# Stop and remove containers
docker-compose down

# Remove containers and volumes (⚠️ data loss!)
docker-compose down -v

# Restart services
docker-compose restart backend

# Execute command in container
docker-compose exec backend /bin/sh

# Check container status
docker-compose ps
```

---

## ⚙️ Port Configuration

### Default Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Frontend | 80 | HTTP | Web UI (Nginx) |
| Backend | 8080 | HTTP | API Server |

### Change Backend Port

#### Option 1: Quick Script (Linux/Mac)
```bash
# Change port 8080 → 3000
sed -i 's/port: 8080/port: 3000/g' backend/config.yaml
sed -i 's/"8080:8080"/"3000:3000"/g' docker-compose.yml
sed -i 's/backend:8080/backend:3000/g' frontend/nginx.conf

# Rebuild and restart
docker-compose down
docker-compose up --build -d
```

#### Option 2: Windows (PowerShell)
```powershell
# Change port 8080 → 3000
(Get-Content backend/config.yaml) -replace 'port: 8080', 'port: 3000' | Set-Content backend/config.yaml
(Get-Content docker-compose.yml) -replace '"8080:8080"', '"3000:3000"' | Set-Content docker-compose.yml
(Get-Content frontend/nginx.conf) -replace 'backend:8080', 'backend:3000' | Set-Content frontend/nginx.conf

# Rebuild and restart
docker-compose down
docker-compose up --build -d
```

#### Option 3: Manual Editing

**backend/config.yaml:**
```yaml
server:
  port: 3000  # Change this
```

**docker-compose.yml:**
```yaml
backend:
  ports:
    - "3000:3000"  # Change this

frontend:
  environment:
    BACKEND_URL: http://backend:3000  # Add this
```

**frontend/nginx.conf:**
```nginx
upstream backend {
    server backend:3000;  # Change this
}
```

### Change Frontend Port

#### docker-compose.yml
```yaml
frontend:
  ports:
    - "8000:80"  # Host:Container (8000 is new port)
```

#### Commands
```bash
docker-compose down
docker-compose up --build -d

# Now access at http://localhost:8000
```

### HTTPS Configuration

#### Using Nginx with Let's Encrypt

**frontend/nginx.conf:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP → HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }

    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**docker-compose.yml:**
```yaml
frontend:
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
    - ./certbot:/var/www/certbot:ro
```

#### Get Certificate (Let's Encrypt)
```bash
docker run -it --rm -v /etc/letsencrypt:/etc/letsencrypt \
  -v ./certbot:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com
```

---

## 📝 API Endpoints

### Authentication
```
POST /api/setup
  - Initial master password setup
  - Request: { "password": "..." }

POST /api/login
  - Login with master password
  - Request: { "password": "..." }
  - Response: { "token": "..." }
```

### Vault Operations
```
GET /api/data
  - Get encrypted vault data
  - Headers: Authorization: Bearer {token}

PUT /api/data
  - Update vault data
  - Headers: Authorization: Bearer {token}
  - Request: { folders, passwords, secret_notes, ... }
```

### Backup Operations
```
POST /api/export
  - Export encrypted backup
  - Request: { "master_password": "...", "passphrase": "..." }
  - Response: Binary .vault file

POST /api/import
  - Import encrypted backup
  - Request: { "master_password": "...", "passphrase": "...", "encrypted_data": "..." }

POST /api/change-password
  - Change master password
  - Request: { "current_password": "...", "new_password": "..." }
```

### Utilities
```
GET /api/status
  - Health check / vault initialization status

POST /api/generate
  - Generate random password
  - Request: { "length": 16, "special": true, ... }

POST /api/destroy
  - Wipe all data (protected)
  - Request: { "password": "..." }
```

---

## 🔍 Configuration

### backend/config.yaml

```yaml
server:
  port: 8080                    # API port

storage:
  data_file_name: data/vault_data.enc
  master_password_file_name: data/master.hash

security:
  session_duration_minutes: 60  # Auto-logout timeout

logging:
  level: info                   # debug, info, warn, error
```

---

## 🔄 Backup & Recovery

### Regular Backups

```bash
# Export backup (monthly)
curl -X POST http://localhost:8080/api/export \
  -H "Content-Type: application/json" \
  -d '{
    "master_password": "your-password",
    "passphrase": "backup-passphrase"
  }' \
  -o backup-$(date +%Y-%m-%d).vault

# Store backup securely
# - Password manager
# - Encrypted cloud storage
# - External drive
```

### Disaster Recovery

```bash
# If vault is lost:
1. Redeploy Vaultimator
2. Do NOT set up new master password yet
3. Import backup using /api/import
4. New master password can be set after import
5. OR restore vault data from backup file
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check logs
docker-compose logs backend

# Verify config
cat backend/config.yaml

# Check disk space
df -h

# Check ports
netstat -tuln | grep 8080
```

### Frontend not loading
```bash
# Check frontend logs
docker-compose logs frontend

# Verify backend is accessible
curl http://localhost:8080/api/status

# Clear browser cache
# Hard refresh: Ctrl+F5 (Cmd+Shift+R on Mac)
```

### Cannot import backup
```bash
# Verify file format
file backup.vault

# Verify passphrase is correct
# Re-export from original node if needed

# Check backend logs
docker-compose logs backend
```

---

## 📜 License

Apache License 2.0 - See LICENSE file

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

---

## ⚠️ Disclaimer

Vaultimator is provided as-is. While we use industry-standard encryption and security practices:

- **You are responsible for:**
  - Keeping your master password secure
  - Regular backups
  - Secure deployment (HTTPS, firewall, etc.)
  - Monitoring access logs
  - Docker/system updates

- **We cannot recover:**
  - Forgotten master password
  - Lost backups
  - Corrupted vault files
  - User error scenarios

**Keep your master password safe. Back up regularly.**

---

**Made with ❤️ for security and privacy** 🔐

Take control of your passwords. Self-host Vaultimator today!
