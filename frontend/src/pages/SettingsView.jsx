import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock, Download, Upload, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../api';

export default function SettingsView() {
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [destroyPassword, setDestroyPassword] = useState('');
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
      const response = await api.post('/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });

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
      // Request encrypted backup from backend
      const response = await api.post('/export', { 
        master_password: exportPassword,
        passphrase: exportPassphrase
      }, {
        responseType: 'arraybuffer'
      });

      // Create blob from encrypted binary data
      const blob = new Blob([response.data], { type: 'application/octet-stream' });

      // Create download link
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
      // Read file as binary
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(importFile);
      });

      // Convert binary to base64
      const uint8Array = new Uint8Array(fileContent);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binaryString);

      // Send encrypted data to backend for import
      const response = await api.post('/import', {
        master_password: importPassword,
        passphrase: importPassphrase,
        encrypted_data: base64Data
      });

      // Update auth token if new one was provided
      if (response.data.token) {
        localStorage.setItem('vault_token', response.data.token);
      }

      addToast('✅ Vault imported successfully! Page will reload in 2 seconds...', 'success');
      
      // Refresh page to load imported data
      setTimeout(() => {
        window.location.reload();
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
    setLoading(true);
    setDestroyError('');
    try {
      await api.post('/destroy', { password: destroyPassword });
      localStorage.removeItem('vault_token');
      addToast('All data destroyed. Redirecting...', 'warning');
      setTimeout(() => navigate('/setup'), 1500);
    } catch (err) {
      setDestroyError(err.response?.data?.error || 'Failed to destroy data.');
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
                  placeholder="Enter current password" 
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setChangePasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowChangePassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setChangePasswordError('');
                    }
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
          <button className="btn btn-danger" onClick={() => setShowDestroyConfirm(true)}>
            Destroy All Data
          </button>
        ) : (
          <div className="animate-fade-in" style={{ padding: '1.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--border-radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <p style={{ color: 'var(--accent-danger)', fontWeight: 600, marginBottom: '1rem' }}>
              ⚠️ CRITICAL: This will permanently delete ALL data. Enter your master password to confirm.
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <input 
                  type="password" 
                  placeholder="Confirm Master Password" 
                  value={destroyPassword}
                  onChange={(e) => setDestroyPassword(e.target.value)}
                  autoFocus
                />
                {destroyError && (
                  <div style={{ color: 'var(--accent-danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{destroyError}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => { setShowDestroyConfirm(false); setDestroyPassword(''); setDestroyError(''); }}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDestroy} disabled={loading || !destroyPassword}>
                  {loading ? 'Destroying...' : 'Confirm Destroy'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
