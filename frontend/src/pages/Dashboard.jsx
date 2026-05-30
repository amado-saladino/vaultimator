import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Folder, FolderPlus, Key, Settings, Search, Plus, LogOut, Shield, MoreVertical, Trash2, Edit2, X } from 'lucide-react';
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
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');
  const [openFolderMenuId, setOpenFolderMenuId] = useState(null);
  
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

  const handleRenameFolder = async (folderId, newName) => {
    if (!newName.trim()) return;
    try {
      const newData = {
        ...data,
        folders: data.folders.map(f => 
          f.id === folderId ? { ...f, name: newName.trim(), updated_at: new Date() } : f
        )
      };
      await api.put('/data', newData);
      await fetchData();
      setRenamingFolderId(null);
      setRenamingFolderName('');
      addToast('Folder renamed successfully', 'success');
    } catch (err) {
      addToast('Failed to rename folder', 'error');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    // Check if folder contains any items
    const itemsInFolder = [
      ...(data.passwords || []).filter(p => p.folder_id === folderId),
      ...(data.secret_notes || []).filter(n => n.folder_id === folderId)
    ];

    if (itemsInFolder.length > 0) {
      addToast(`Cannot delete folder: it contains ${itemsInFolder.length} item(s). Please move or delete items first.`, 'warning');
      return;
    }

    try {
      const newData = {
        ...data,
        folders: data.folders.filter(f => f.id !== folderId)
      };
      await api.put('/data', newData);
      await fetchData();
      if (activeFolder === folderId) {
        setActiveFolder(null);
      }
      setOpenFolderMenuId(null);
      addToast('Folder deleted successfully', 'success');
    } catch (err) {
      addToast('Failed to delete folder', 'error');
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setShowNewFolder(false);
                  }}
                  autoFocus
                  style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                />
                <button className="btn btn-primary" onClick={handleCreateFolder} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                  Add
                </button>
              </div>
            )}

            {data.folders.map(f => (
              <div key={f.id} style={{ position: 'relative' }}>
                {renamingFolderId === f.id ? (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem', paddingLeft: '0.25rem', paddingRight: '0.25rem' }}>
                    <input 
                      value={renamingFolderName} 
                      onChange={(e) => setRenamingFolderName(e.target.value)} 
                      placeholder="Folder name" 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(f.id, renamingFolderName);
                        if (e.key === 'Escape') setRenamingFolderId(null);
                      }}
                      autoFocus
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', flex: 1 }}
                    />
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleRenameFolder(f.id, renamingFolderName)} 
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div 
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}
                    onMouseEnter={() => setOpenFolderMenuId(f.id)}
                    onMouseLeave={() => setOpenFolderMenuId(null)}
                  >
                    <NavItem 
                      icon={<Folder size={18} />} 
                      label={f.name} 
                      active={activeFolder === f.id}
                      onClick={() => { setActiveFolder(f.id); navigate('/dashboard'); }}
                      style={{ flex: 1 }}
                    />
                    {openFolderMenuId === f.id && (
                      <div style={{ display: 'flex', gap: '0.25rem', marginRight: '0.5rem' }}>
                        <button
                          onClick={() => {
                            setRenamingFolderId(f.id);
                            setRenamingFolderName(f.name);
                            setOpenFolderMenuId(null);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            hover: { backgroundColor: 'rgba(255,255,255,0.1)' }
                          }}
                          title="Rename folder"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(f.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-danger)',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Delete folder"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
