import { useNavigate } from 'react-router-dom';
import { Globe, FileText, Folder } from 'lucide-react';

export default function VaultList({ data, searchQuery, activeFolder }) {
  const navigate = useNavigate();

  const query = searchQuery.toLowerCase();

  // Filter passwords by folder and search
  let passwords = (data.passwords || []).filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.website.toLowerCase().includes(query) || 
    p.username.toLowerCase().includes(query)
  );

  // Filter notes by folder and search
  let notes = (data.secret_notes || []).filter(n => 
    n.title.toLowerCase().includes(query) || 
    n.note.toLowerCase().includes(query)
  );

  // Apply folder filter
  if (activeFolder) {
    passwords = passwords.filter(p => p.folder_id === activeFolder);
    notes = notes.filter(n => n.folder_id === activeFolder);
  }

  const items = [
    ...passwords.map(p => ({ ...p, type: 'password' })),
    ...notes.map(n => ({ ...n, type: 'note' }))
  ].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  // Get folder name for header
  const currentFolderName = activeFolder 
    ? data.folders?.find(f => f.id === activeFolder)?.name 
    : null;

  if (items.length === 0) {
    const emptyMessage = searchQuery 
      ? 'No items match your search.' 
      : activeFolder 
        ? `This folder is empty. Click "New Item" to add items here.`
        : 'Your vault is empty. Click "New Item" to get started.';
    
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        {currentFolderName && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Folder size={20} color="var(--accent-primary)" />
            <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>{currentFolderName}</h2>
          </div>
        )}
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {currentFolderName && (
        <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Folder size={24} color="var(--accent-primary)" />
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>{currentFolderName}</h2>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>({items.length} item{items.length !== 1 ? 's' : ''})</span>
        </div>
      )}
      
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {items.map(item => (
          <div 
            key={item.id} 
            className="glass-panel animate-fade-in"
            onClick={() => navigate(`/dashboard/item/${item.id}?type=${item.type}`)}
            style={{ 
              padding: '1.25rem', 
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ 
                width: '40px', height: '40px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(255,255,255,0.05)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center' 
              }}>
                {item.type === 'password' ? <Globe size={20} color="var(--accent-primary)" /> : <FileText size={20} color="var(--accent-success)" />}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {item.type === 'password' ? item.username : 'Secret Note'}
                </div>
              </div>
            </div>
            {item.type === 'password' && item.website && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.website}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
