import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import api from '../api';

export default function LoginPage({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/login', { password });
      localStorage.setItem('vault_token', res.data.token);
      onLoginSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid master password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="centered-page">
      <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Unlock size={48} color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
          <h1 style={{ marginBottom: '0.5rem' }}>Unlock Vault</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Enter your master password to decrypt your data.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Master Password"
                required
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', borderRadius: 'var(--border-radius-sm)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
