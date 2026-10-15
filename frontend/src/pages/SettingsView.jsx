import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock, Download, Upload, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../api';
import axios from 'axios';
import { hashPassword, encryptBackup, decryptBackup, deriveFieldKey, encryptField, decryptField, setFieldKey } from '../crypto';

export default function SettingsView() {
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [destroyPassword, setDestroyPassword] = useState('');
  const [destroyPasswordError, setDestroyPasswordError] = useState('');
  const [destroyError, setDestroyError] = useState('');
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPassword, setImportPassword] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importError, setImportError] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportPasswordError, setExportPasswordError] = useState('');
  const [showExportPasswordField, setShowExportPasswordField] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const addToast = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('vault_timeout_minutes');
    if (stored) {
      setTimeoutMinutes(parseInt(stored, 10));
    }
  }, []);

  const handleSaveTimeout = () => {
    localStorage.setItem('vault_timeout_minutes', timeoutMinutes);
    addToast('Auto-logout timeout updated successfully!', 'success');
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword.trim()) {
      setChangePasswordError('Please enter your current password');
      return;
    }

    if (!newPassword.trim()) {
      setChangePasswordError('Please enter a new password');
      return;
    }

    if (newPassword.length < 12) {
      setChangePasswordError('New password must be at least 12 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordError('Passwords do not match');
      return;
    }

    if (newPassword === currentPassword) {
      setChangePasswordError('New password must be different from current password');
      return;
    }

    setChangePasswordLoading(true);
    setChangePasswordError('');

    try {
      const currentHashed = await hashPassword(currentPassword);
      const newHashed = await hashPassword(newPassword);

      // Field-level (E2EE) encryption is keyed off the master password, so the
      // stored fields must be re-encrypted with a key derived from the new one.
      // Do all the decrypt/encrypt work first, so a wrong password or corrupted
      // field aborts before anything is changed on the server.
      const tokenRes = await axios.post('/api/token', {
        grant_type: 'password',
        password: currentHashed
      });
      const rawRes = await axios.get('/api/data', {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
      });
      const vaultData = JSON.parse(JSON.stringify(rawRes.data));

      const oldKey = await deriveFieldKey(currentPassword);
      const newKey = await deriveFieldKey(newPassword);
      const reencrypt = async (value) => {
        const plain = await decryptField(oldKey, value);
        if (plain === '[[DECRYPTION_FAILED]]') {
          throw new Error('Failed to decrypt existing vault items; password not changed');
        }
        return encryptField(newKey, plain);
      };
      for (const p of vaultData.passwords || []) {
        p.password = await reencrypt(p.password);
        p.note = await reencrypt(p.note);
      }
      for (const n of vaultData.secret_notes || []) {
        n.note = await reencrypt(n.note);
      }

      await api.post('/change-password', {
        current_password: currentHashed,
        new_password: newHashed
      });

      // Sessions are invalidated by the change; log in with the new password
      // and save the re-encrypted items.
      try {
        const newTokenRes = await axios.post('/api/token', {
          grant_type: 'password',
          password: newHashed
        });
        await axios.put('/api/data', vaultData, {
          headers: { Authorization: `Bearer ${newTokenRes.data.access_token}` }
        });
      } catch (saveErr) {
        console.error('Re-encryption save error:', saveErr);
        throw new Error('Password changed, but re-encrypting vault items failed. Restore from a backup.');
      }

      addToast('✅ Master password changed successfully! Please log in again.', 'success');
      
      // Clear session and redirect to login
      localStorage.removeItem('vault_token');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      console.error('Change password error:', err);
      let errorMsg = 'Failed to change password';
      
      if (err.response?.status === 401) {
        errorMsg = 'Invalid current password';
      } else if (err.response?.data?.error) {
        errorMsg = err.response.data.error;
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setChangePasswordError(errorMsg);
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleExport = async () => {
    setShowExportPasswordField(true);
    setExportPassword('');
    setExportPassphrase('');
    setExportPasswordError('');
  };

  const handleExportWithPasswords = async () => {
    if (!exportPassword.trim()) {
      setExportPasswordError('Please enter your master password');
      return;
    }

    if (!exportPassphrase.trim()) {
      setExportPasswordError('Please enter a passphrase for the backup');
      return;
    }

    setExportLoading(true);
    setExportPasswordError('');

    try {
      const hashedMaster = await hashPassword(exportPassword);

      // Authenticate with master password to get a fresh token
      const tokenRes = await axios.post('/api/token', {
        grant_type: 'password',
        password: hashedMaster
      });
      const freshToken = tokenRes.data.access_token;

      // Fetch RAW vault data via axios directly (bypasses response interceptor)
      // so that v1:... encrypted fields are preserved exactly as stored
      const rawRes = await axios.get('/api/data', {
        headers: { Authorization: `Bearer ${freshToken}` }
      });
      const rawVaultData = JSON.parse(JSON.stringify(rawRes.data));

      // Derive the field key from the master password the user entered
      const fieldKey = await deriveFieldKey(exportPassword);

      // Decrypt all E2EE fields to plaintext so the backup is self-contained
      for (const p of rawVaultData.passwords || []) {
        p.password = await decryptField(fieldKey, p.password);
        p.note     = await decryptField(fieldKey, p.note);
      }
      for (const n of rawVaultData.secret_notes || []) {
        n.note = await decryptField(fieldKey, n.note);
      }

      // Construct and encrypt the backup with the passphrase
      const backup = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        vault_data: rawVaultData
      };
      const encryptedBuffer = await encryptBackup(backup, exportPassphrase);

      // Download the file
      const blob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vaultimator-backup-${new Date().toISOString().split('T')[0]}.vault`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addToast('✅ Vault exported successfully! File is fully encrypted with your passphrase.', 'success');
      setShowExportPasswordField(false);
      setExportPassword('');
      setExportPassphrase('');
    } catch (err) {
      console.error('Export error:', err);
      let errorMsg = 'Failed to export vault';
      if (err.response?.status === 401) {
        errorMsg = 'Invalid master password';
      } else if (err.response?.data?.error) {
        errorMsg = err.response.data.error;
      }
      setExportPasswordError(errorMsg);
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - accept .vault or .json (for backward compatibility)
    if (!file.name.endsWith('.vault') && !file.name.endsWith('.json')) {
      addToast('Please select a valid Vaultimator backup file (.vault or .json)', 'error');
      return;
    }

    setImportFile(file);
    setShowImportConfirm(true);
    setImportPassword('');
    setImportPassphrase('');
    setImportError('');
  };

  const handleImportConfirm = async () => {
    if (!importFile || !importPassword.trim() || !importPassphrase.trim()) {
      setImportError('Please select a file and enter both master password and passphrase');
      return;
    }

    setImportLoading(true);
    setImportError('');

    try {
      // 1. Decrypt the backup file with the passphrase
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(importFile);
      });

      const backup = await decryptBackup(fileContent, importPassphrase);
      if (!backup || !backup.vault_data) {
        throw new Error('Invalid backup file format');
      }

      // 2. Authenticate first so we have a valid session token
      const hashedMaster = await hashPassword(importPassword);
      const tokenRes = await axios.post('/api/token', {
        grant_type: 'password',
        password: hashedMaster
      });
      const freshToken = tokenRes.data.access_token;
      localStorage.setItem('vault_token', freshToken);

      // 3. Derive the field key from the plaintext import password and store it
      //    in memory so the api interceptor uses it to encrypt fields on PUT.
      const fieldKey = await deriveFieldKey(importPassword);
      setFieldKey(fieldKey);

      // 4. Strip any pre-existing v1: encryption from backup fields so they
      //    arrive as plaintext — the api.put interceptor will re-encrypt them
      //    with the correct key derived from importPassword.
      const vaultData = backup.vault_data;
      for (const p of vaultData.passwords || []) {
        if (p.password?.startsWith('v1:')) p.password = await decryptField(fieldKey, p.password);
        if (p.note?.startsWith('v1:'))     p.note     = await decryptField(fieldKey, p.note);
      }
      for (const n of vaultData.secret_notes || []) {
        if (n.note?.startsWith('v1:')) n.note = await decryptField(fieldKey, n.note);
      }

      // 5. Save via the normal api client — the request interceptor encrypts
      //    all sensitive fields with the field key before sending.
      await api.put('/data', vaultData);

      addToast('✅ Vault imported successfully! Please log in again to load your vault.', 'success');

      // 6. Clear session and field key, then redirect to login
      setFieldKey(null);
      localStorage.removeItem('vault_token');
      localStorage.removeItem('vault_refresh_token');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      console.error('Import error:', err);
      let errorMsg = 'Failed to import vault';
      
      if (err.response?.status === 401) {
        errorMsg = 'Invalid master password or backup passphrase';
      } else if (err.response?.status === 400) {
        errorMsg = 'Invalid backup file format. Make sure this is a valid Vaultimator backup file.';
      } else if (err.response?.data?.error) {
        errorMsg = err.response.data.error;
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setImportError(errorMsg);
    } finally {
      setImportLoading(false);
    }
  };

  const handleDestroy = async () => {
    if (!destroyPassword.trim()) {
      setDestroyPasswordError('Please enter your master password to confirm.');
      return;
    }
    setLoading(true);
    setDestroyError('');
    setDestroyPasswordError('');
    try {
      const hashedPassword = await hashPassword(destroyPassword);
      await api.post('/destroy', { master_password: hashedPassword });
      localStorage.removeItem('vault_token');
      addToast('All data destroyed. Redirecting...', 'warning');
      setTimeout(() => navigate('/setup'), 1500);
    } catch (err) {
      if (err.response?.status === 401) {
        setDestroyPasswordError('Incorrect master password.');
      } else {
        setDestroyError(err.response?.data?.error || 'Failed to destroy data.');
      }
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Settings</h2>

      {/* Security Options */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Clock size={20} color="var(--accent-primary)" /> Security Options
        </h3>
        
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1 }}>
            <label>Auto-Logout Timeout (minutes)</label>
            <input 
              type="number" 
              min="1" 
              max="1440" 
              value={timeoutMinutes} 
              onChange={(e) => setTimeoutMinutes(e.target.value)} 
            />
          </div>
          <button className="btn btn-primary" onClick={handleSaveTimeout}>Save</button>
        </div>
        <p style={{ marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          The vault will automatically lock after this period of inactivity.
        </p>

        {/* Change Master Password Button */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              setShowChangePassword(true);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setChangePasswordError('');
            }}
            style={{ width: '100%' }}
          >
            🔑 Change Master Password
          </button>
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Change the master password that unlocks your vault. You'll be logged out after changing.
          </p>
        </div>

        {/* Change Password Modal */}
        {showChangePassword && (
          <div className="animate-fade-in" style={{ 
            marginTop: '1.5rem',
            padding: '1.5rem', 
            backgroundColor: 'rgba(99, 102, 241, 0.05)', 
            borderRadius: 'var(--border-radius-sm)', 
            border: '1px solid rgba(99, 102, 241, 0.2)'
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <AlertCircle size={20} color="var(--accent-warning)" style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Change Master Password
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Enter your current password, then set a new one. You'll need to log in again with your new password.
                  <br />
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-warning)', marginTop: '0.5rem', display: 'block' }}>
                    ⚠️ New password must be at least 12 characters and different from current password.
                  </span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Current Master Password
                </label>
                <input 
                  type="password" 
                  placeholder="Enter your current password" 
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setChangePasswordError('');
                  }}
                  autoFocus
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  New Master Password
                </label>
                <input 
                  type="password" 
                  placeholder="Enter new password (12+ characters)" 
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setChangePasswordError('');
                  }}
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Confirm New Password
                </label>
                <input 
                  type="password" 
                  placeholder="Confirm new password" 
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setChangePasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !changePasswordLoading && currentPassword.trim() && newPassword.trim() && confirmPassword.trim()) {
                      handleChangePassword();
                    }
                    if (e.key === 'Escape') {
                      setShowChangePassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setChangePasswordError('');
                    }
                  }}
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              {changePasswordError && (
                <div style={{ color: 'var(--accent-danger)', fontSize: '0.8rem' }}>
                  ❌ {changePasswordError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => {
                    setShowChangePassword(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setChangePasswordError('');
                  }}
                  disabled={changePasswordLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleChangePassword}
                  disabled={changePasswordLoading || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()}
                >
                  {changePasswordLoading ? 'Changing Password...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import / Export */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem' }}>Backup & Restore</h3>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleExport}
            disabled={exportLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Download size={18} /> 
            {exportLoading ? 'Exporting...' : 'Export Encrypted Backup'}
          </button>
          
          <button 
            className="btn btn-ghost" 
            onClick={handleImportClick}
            style={{ border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Upload size={18} /> Import Backup
          </button>
          
          <input 
            ref={fileInputRef}
            type="file"
            accept=".vault,.json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          💾 <strong>Export:</strong> Download a fully encrypted backup of your entire vault. You'll be prompted for your master password.
          <br />
          📂 <strong>Import:</strong> Restore a previously exported backup. You'll need the password that was used when exporting (from the original vault).
          <br />
          <span style={{ fontSize: '0.75rem', marginTop: '0.5rem', display: 'block', color: 'var(--accent-warning)' }}>
            ⚠️ <strong>Important:</strong> If importing a backup from a different vault, use the password from that original vault, not your current password.
          </span>
        </p>

        {showExportPasswordField && (
          <div className="animate-fade-in" style={{ 
            padding: '1.5rem', 
            backgroundColor: 'rgba(99, 102, 241, 0.05)', 
            borderRadius: 'var(--border-radius-sm)', 
            border: '1px solid rgba(99, 102, 241, 0.2)',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <AlertCircle size={20} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Export Encrypted Backup
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Step 1: Enter your master password to verify access to your vault.
                  <br />
                  Step 2: Set a passphrase for the backup (can be same or different from master password).
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Master Password
                </label>
                <input 
                  type="password" 
                  placeholder="Enter your master password" 
                  value={exportPassword}
                  onChange={(e) => {
                    setExportPassword(e.target.value);
                    setExportPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowExportPasswordField(false);
                      setExportPassword('');
                      setExportPassphrase('');
                      setExportPasswordError('');
                    }
                  }}
                  autoFocus
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Backup Passphrase
                </label>
                <input 
                  type="password" 
                  placeholder="Enter a passphrase for this backup" 
                  value={exportPassphrase}
                  onChange={(e) => {
                    setExportPassphrase(e.target.value);
                    setExportPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !exportLoading && exportPassword.trim() && exportPassphrase.trim()) {
                      handleExportWithPasswords();
                    }
                    if (e.key === 'Escape') {
                      setShowExportPasswordField(false);
                      setExportPassword('');
                      setExportPassphrase('');
                      setExportPasswordError('');
                    }
                  }}
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              {exportPasswordError && (
                <div style={{ color: 'var(--accent-danger)', fontSize: '0.8rem' }}>
                  ❌ {exportPasswordError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => {
                    setShowExportPasswordField(false);
                    setExportPassword('');
                    setExportPassphrase('');
                    setExportPasswordError('');
                  }}
                  disabled={exportLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleExportWithPasswords}
                  disabled={exportLoading || !exportPassword.trim() || !exportPassphrase.trim()}
                >
                  {exportLoading ? 'Exporting...' : 'Export Backup'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportConfirm && (
          <div className="animate-fade-in" style={{ 
            padding: '1.5rem', 
            backgroundColor: 'rgba(99, 102, 241, 0.05)', 
            borderRadius: 'var(--border-radius-sm)', 
            border: '1px solid rgba(99, 102, 241, 0.2)',
            marginTop: '1rem'
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <AlertCircle size={20} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Restore Encrypted Backup
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Selected file: <strong>{importFile?.name}</strong>
                  <br />
                  Enter your master password and the passphrase used when exporting this backup.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Master Password
                </label>
                <input 
                  type="password" 
                  placeholder="Enter your master password" 
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowImportConfirm(false);
                      setImportPassword('');
                      setImportPassphrase('');
                      setImportError('');
                    }
                  }}
                  autoFocus
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Backup Passphrase
                </label>
                <input 
                  type="password" 
                  placeholder="Enter the passphrase used when exporting" 
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !importLoading && importPassword.trim() && importPassphrase.trim()) handleImportConfirm();
                    if (e.key === 'Escape') {
                      setShowImportConfirm(false);
                      setImportPassword('');
                      setImportPassphrase('');
                      setImportError('');
                    }
                  }}
                  style={{ marginTop: '0.25rem' }}
                />
              </div>

              {importError && (
                <div style={{ color: 'var(--accent-danger)', fontSize: '0.8rem' }}>
                  ❌ {importError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => {
                    setShowImportConfirm(false);
                    setImportPassword('');
                    setImportPassphrase('');
                    setImportError('');
                    setImportFile(null);
                  }}
                  disabled={importLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleImportConfirm}
                  disabled={importLoading || !importPassword.trim() || !importPassphrase.trim()}
                >
                  {importLoading ? 'Importing...' : 'Import Backup'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="glass-panel" style={{ padding: '2rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-danger)', marginBottom: '1.5rem' }}>
          <ShieldAlert size={20} /> Danger Zone
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Destroying your vault will permanently delete all passwords, notes, and the master hash. This action cannot be undone.
        </p>

        {!showDestroyConfirm ? (
          <button className="btn btn-danger" onClick={() => { setShowDestroyConfirm(true); setDestroyPassword(''); setDestroyPasswordError(''); setDestroyError(''); }}>
            Destroy All Data
          </button>
        ) : (
          <div className="animate-fade-in" style={{ padding: '1.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--border-radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <p style={{ color: 'var(--accent-danger)', fontWeight: 600, marginBottom: '1rem' }}>
              ⚠️ CRITICAL: This will permanently delete ALL data. Are you sure?
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Enter your master password to confirm:
              </label>
              <input
                type="password"
                placeholder="Master password"
                value={destroyPassword}
                onChange={(e) => { setDestroyPassword(e.target.value); setDestroyPasswordError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading && destroyPassword.trim()) handleDestroy();
                  if (e.key === 'Escape') { setShowDestroyConfirm(false); setDestroyPassword(''); setDestroyPasswordError(''); setDestroyError(''); }
                }}
                autoFocus
                style={{ marginTop: '0.25rem', borderColor: destroyPasswordError ? 'var(--accent-danger)' : undefined }}
              />
              {destroyPasswordError && (
                <div style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  ❌ {destroyPasswordError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => { setShowDestroyConfirm(false); setDestroyPassword(''); setDestroyPasswordError(''); setDestroyError(''); }} disabled={loading}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDestroy} disabled={loading || !destroyPassword.trim()}>
                  {loading ? 'Destroying...' : 'Confirm Destroy'}
                </button>
              </div>
            </div>
            {destroyError && (
              <div style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
                ❌ {destroyError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
