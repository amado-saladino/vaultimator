import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock, Download, Upload } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../api';

export default function SettingsView() {
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [destroyPassword, setDestroyPassword] = useState('');
  const [destroyError, setDestroyError] = useState('');
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const handleExport = async () => {
    addToast('Export feature coming soon — requires direct encrypted file download.', 'info');
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
        
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
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
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          The vault will automatically lock after this period of inactivity.
        </p>
      </div>

      {/* Import / Export */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem' }}>Backup & Restore</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-ghost" style={{ border: '1px solid var(--border-color)' }} onClick={handleExport}>
            <Download size={18} /> Export Encrypted Backup
          </button>
          <button className="btn btn-ghost" style={{ border: '1px solid var(--border-color)' }}>
            <Upload size={18} /> Import Backup
          </button>
        </div>
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
