import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Folder, FolderPlus, Key, Settings, Search, Plus, LogOut, Shield } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../api';

import VaultList from './VaultList';
import SettingsView from './SettingsView';
import ItemDetail from './ItemDetail';

export default function Dashboard({ onLogout }) {
  const [data, setData] = useState({ folders: [], passwords: [], secret_notes: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const navigate = useNavigate();
  const location = useLocation();
  const addToast = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.get('/data');
      setData({
        folders: res.data.folders || [],
        passwords: res.data.passwords || [],
        secret_notes: res.data.secret_notes || [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const generateId = () => Math.random().toString(36).substr(2, 9);
      const newData = {
        ...data,
        folders: [...data.folders, { id: generateId(), name: newFolderName.trim(), created_at: new Date(), updated_at: new Date() }]
      };
      await api.put('/data', newData);
      await fetchData();
      setNewFolderName('');
      setShowNewFolder(false);
      addToast(`Folder "${newFolderName.trim()}" created`, 'success');
    } catch (err) {
      addToast('Failed to create folder', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ 
        width: '260px', 
        backgroundColor: 'var(--bg-surface)', 
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Shield size={24} color="var(--accent-primary)" /> Vaultimator
          </h2>
        </div>

        <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <NavItem 
              icon={<Key size={18} />} 
              label="All Items" 
              active={location.pathname === '/dashboard' && !activeFolder} 
              onClick={() => { setActiveFolder(null); navigate('/dashboard'); }} 
            />
            <NavItem 
              icon={<Settings size={18} />} 
              label="Settings" 
              active={location.pathname.startsWith('/dashboard/settings')} 
              onClick={() => navigate('/dashboard/settings')} 
            />
          </nav>

          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingLeft: '0.75rem', paddingRight: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Folders
              </span>
              <button 
                onClick={() => setShowNewFolder(!showNewFolder)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', borderRadius: '4px', display: 'flex' }}
                title="Create folder"
              >
                <FolderPlus size={16} />
              </button>
            </div>

            {showNewFolder && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', paddingLeft: '0.25rem', paddingRight: '0.25rem' }}>
                <input 
                  value={newFolderName} 
                  onChange={(e) => setNewFolderName(e.target.value)} 
                  placeholder="Folder name" 
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  autoFocus
                  style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                />
                <button className="btn btn-primary" onClick={handleCreateFolder} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                  Add
                </button>
              </div>
            )}

            {data.folders.map(f => (
              <NavItem 
                key={f.id} 
                icon={<Folder size={18} />} 
                label={f.name} 
                active={activeFolder === f.id}
                onClick={() => { setActiveFolder(f.id); navigate('/dashboard'); }}
              />
            ))}
          </div>
        </div>

        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <button onClick={onLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)' }}>
        {/* Topbar */}
        <div style={{ height: '70px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 2rem', justifyContent: 'space-between' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={18} style={{ position: 'absolute', top: '10px', left: '12px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search vault..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.5rem', backgroundColor: 'var(--bg-surface)', border: 'none' }}
            />
          </div>

          <button className="btn btn-primary" onClick={() => navigate('/dashboard/new')}>
            <Plus size={18} /> New Item
          </button>
        </div>

        {/* Dynamic Route Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Decrypting vault...</div>
          ) : (
            <Routes>
              <Route path="/" element={<VaultList data={data} searchQuery={searchQuery} activeFolder={activeFolder} onUpdate={fetchData} />} />
              <Route path="/new" element={<ItemDetail data={data} isNew={true} onUpdate={fetchData} />} />
              <Route path="/item/:id" element={<ItemDetail data={data} isNew={false} onUpdate={fetchData} />} />
              <Route path="/settings" element={<SettingsView />} />
            </Routes>
          )}
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div 
      onClick={onClick}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.75rem', 
        padding: '0.5rem 0.75rem', 
        borderRadius: 'var(--border-radius-sm)',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s ease'
      }}
    >
      <span style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{icon}</span>
      {label}
    </div>
  );
}
