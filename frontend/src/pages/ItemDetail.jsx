import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Trash, RefreshCw, Eye, EyeOff, Copy, Folder } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../api';

export default function ItemDetail({ data, isNew, onUpdate }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'password';
  const addToast = useToast();

  const [type, setType] = useState(initialType);
  const [showPassword, setShowPassword] = useState(false);
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
      const res = await api.post('/generate', { length: 16, include_upper: true, include_lower: true, include_numbers: true, include_special: true });
      setForm({ ...form, password: res.data.password });
      addToast('Password generated', 'success');
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
              <label>Password</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleChange} />
                <button className="btn btn-ghost" onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Hide password' : 'Show password'} style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <button className="btn btn-ghost" onClick={() => copyToClipboard(form.password, 'Password')} title="Copy password" style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
                  <Copy size={18} />
                </button>
                <button className="btn btn-ghost" onClick={generatePassword} title="Generate password" style={{ border: '1px solid var(--border-color)', flexShrink: 0 }}>
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
