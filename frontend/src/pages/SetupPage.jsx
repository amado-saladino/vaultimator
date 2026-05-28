import { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import api from '../api';

export default function SetupPage({ onSetupComplete }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/setup', { password });
      onSetupComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to setup master password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="centered-page">
      <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <ShieldCheck size={48} color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
          <h1 style={{ marginBottom: '0.5rem' }}>Welcome to Vaultimator</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Create your master password to initialize your secure vault.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label>Master Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Min 12 chars, upper, lower, number, special"
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Repeat master password"
                required
              />
            </div>
          </div>

          {error && (
            <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', borderRadius: 'var(--border-radius-sm)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Initializing Vault...' : 'Setup Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
