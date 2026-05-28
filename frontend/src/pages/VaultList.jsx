import { useNavigate } from 'react-router-dom';
import { Globe, FileText } from 'lucide-react';

export default function VaultList({ data, searchQuery }) {
  const navigate = useNavigate();

  const query = searchQuery.toLowerCase();

  const passwords = (data.passwords || []).filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.website.toLowerCase().includes(query) || 
    p.username.toLowerCase().includes(query)
  );

  const notes = (data.secret_notes || []).filter(n => 
    n.title.toLowerCase().includes(query) || 
    n.note.toLowerCase().includes(query)
  );

  const items = [
    ...passwords.map(p => ({ ...p, type: 'password' })),
    ...notes.map(n => ({ ...n, type: 'note' }))
  ].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        {searchQuery ? 'No items match your search.' : 'Your vault is empty. Click "New Item" to get started.'}
      </div>
    );
  }

  return (
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
  );
}
