import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Trash, RefreshCw, Eye, EyeOff, Copy, Folder } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../api';

// CSS styles for password length slider
const sliderStyles = `
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
    outline: none;
    -webkit-slider-thumb-appearance: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-primary, #6366f1);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    border: 2px solid white;
  }

  input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-primary, #6366f1);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    border: 2px solid white;
  }

  input[type="range"]::-moz-range-track {
    background: transparent;
    border: none;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    background: rgba(0, 0, 0, 0.2);
    height: 6px;
    border-radius: 3px;
  }
`;

// Inject styles into document
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = sliderStyles;
  if (!document.head.querySelector('style[data-slider-styles]')) {
    styleElement.setAttribute('data-slider-styles', 'true');
    document.head.appendChild(styleElement);
  }
}

export default function ItemDetail({ data, isNew, onUpdate }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'password';
  const addToast = useToast();

  const [type, setType] = useState(initialType);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(16);
  const [showLengthPanel, setShowLengthPanel] = useState(false);
  const [form, setForm] = useState({
    title: '',
    username: '',
    password: '',
    website: '',
    note: '',
    folder_id: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      let item = null;
      if (initialType === 'password') {
        item = data.passwords?.find(p => p.id === id);
      } else {
        item = data.secret_notes?.find(n => n.id === id);
      }

      if (item) {
        setForm({
          title: item.title || '',
          username: item.username || '',
          password: item.password || '',
          website: item.website || '',
          note: item.note || '',
          folder_id: item.folder_id || ''
        });
      }
    }
  }, [id, isNew, data, initialType]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const generatePassword = async () => {
    try {
      const res = await api.post('/generate', { 
        length: passwordLength, 
        include_upper: true, 
        include_lower: true, 
        include_numbers: true, 
        include_special: true 
      });
      setForm({ ...form, password: res.data.password });
      addToast(`✅ Password generated (${passwordLength} characters)`, 'success');
      setShowLengthPanel(false);
    } catch (err) {
      addToast('Failed to generate password', 'error');
    }
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${label} copied to clipboard`, 'success');
    } catch {
      addToast('Failed to copy', 'error');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let newData = { ...data };
      
      const generateId = () => Math.random().toString(36).substr(2, 9);
      
      if (isNew) {
        if (type === 'password') {
          newData.passwords = [...(newData.passwords || []), { ...form, id: generateId(), created_at: new Date(), updated_at: new Date() }];
        } else {
          newData.secret_notes = [...(newData.secret_notes || []), { ...form, id: generateId(), created_at: new Date(), updated_at: new Date() }];
        }
      } else {
        if (type === 'password') {
          newData.passwords = newData.passwords.map(p => p.id === id ? { ...p, ...form, updated_at: new Date() } : p);
        } else {
          newData.secret_notes = newData.secret_notes.map(n => n.id === id ? { ...n, ...form, updated_at: new Date() } : n);
        }
      }

      await api.put('/data', newData);
      await onUpdate();
      addToast(isNew ? 'Item created successfully' : 'Changes saved', 'success');
      navigate('/dashboard');
    } catch (err) {
      addToast('Failed to save item', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      let newData = { ...data };
      if (type === 'password') {
        newData.passwords = newData.passwords.filter(p => p.id !== id);
      } else {
        newData.secret_notes = newData.secret_notes.filter(n => n.id !== id);
      }
      
      await api.put('/data', newData);
      await onUpdate();
      addToast('Item deleted', 'info');
      navigate('/dashboard');
    } catch (err) {
      addToast('Failed to delete item', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: '0.5rem' }}>
          <ArrowLeft size={20} /> Back
        </button>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {!isNew && (
            <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
              <Trash size={18} /> Delete
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            <Save size={18} /> {isNew ? 'Create Item' : 'Save Changes'}
          </button>
        </div>
      </div>

      {isNew && (
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="radio" checked={type === 'password'} onChange={() => setType('password')} style={{ width: 'auto' }} /> Password
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="radio" checked={type === 'note'} onChange={() => setType('note')} style={{ width: 'auto' }} /> Secret Note
          </label>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div>
          <label>Title</label>
          <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. Gmail" autoFocus />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Folder size={16} /> Folder
          </label>
          <select 
            name="folder_id" 
            value={form.folder_id} 
            onChange={handleChange}
            style={{ 
              width: '100%',
              padding: '0.6rem',
              borderRadius: 'var(--border-radius-sm)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <option value="">No Folder (Uncategorized)</option>
            {(data.folders || []).map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Organize this item into a folder
          </div>
        </div>

        {type === 'password' && (
          <>
            <div>
              <label>Username / Email</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input name="username" value={form.username} onChange={handleChange} />
                <button className="btn btn-ghost" onClick={() => copyToClipboard(form.username, 'Username')} title="Copy username" style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  <Copy size={18} />
                </button>
              </div>
            </div>
            
            <div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Password</span>
                <button 
                  className="btn btn-link"
                  onClick={() => setShowLengthPanel(!showLengthPanel)}
                  style={{ 
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--accent-primary)'
                  }}
                >
                  {showLengthPanel ? '▼ Hide Length' : '▶ Password Length'}
                </button>
              </label>

              {showLengthPanel && (
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(99, 102, 241, 0.05)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: 'var(--border-radius-sm)',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Select Length</label>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                      {passwordLength} characters
                    </span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="30"
                    value={passwordLength}
                    onChange={(e) => setPasswordLength(Number(e.target.value))}
                    style={{ 
                      width: '100%', 
                      cursor: 'pointer',
                      marginBottom: '0.5rem',
                      boxSizing: 'border-box',
                      padding: '0px',
                      margin: '0px',
                      height: '6px',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      background: 'transparent'
                    }}
                  />
                  <div style={{ 
                    fontSize: '0.7rem', 
                    color: 'var(--text-muted)', 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    marginBottom: '1rem'
                  }}>
                    <span>12 (Min)</span>
                    <span>30 (Max)</span>
                  </div>

                  <div style={{ 
                    padding: '0.75rem',
                    backgroundColor: passwordLength >= 20 ? 'rgba(16, 185, 129, 0.1)' : passwordLength >= 16 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${passwordLength >= 20 ? 'rgba(16, 185, 129, 0.3)' : passwordLength >= 16 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: 'var(--border-radius-sm)',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)'
                  }}>
                    {passwordLength >= 20 && '✅ Strong security (20+ characters)'}
                    {passwordLength >= 16 && passwordLength < 20 && '⚠️ Good security (16-19 characters) - Recommended'}
                    {passwordLength < 16 && '❌ Minimum security (12-15 characters)'}
                  </div>

                  <button 
                    className="btn btn-primary"
                    onClick={generatePassword}
                    style={{ width: '100%' }}
                  >
                    <RefreshCw size={16} style={{ marginRight: '0.5rem' }} />
                    Generate {passwordLength}-Character Password
                  </button>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleChange} />
                <button className="btn btn-ghost" onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Hide password' : 'Show password'} style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <button className="btn btn-ghost" onClick={() => copyToClipboard(form.password, 'Password')} title="Copy password" style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  <Copy size={18} />
                </button>
                <button className="btn btn-ghost" onClick={() => setShowLengthPanel(true)} title="Generate password" style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>

            <div>
              <label>Website / App</label>
              <input name="website" value={form.website} onChange={handleChange} placeholder="https://..." />
            </div>
          </>
        )}

        <div>
          <label>Notes</label>
          <textarea name="note" value={form.note} onChange={handleChange} rows={5} />
        </div>
      </div>
    </div>
  );
}
