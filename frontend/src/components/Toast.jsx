import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div style={{
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        pointerEvents: 'none',
      }}>
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const iconMap = {
  success: <CheckCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const colorMap = {
  success: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', color: '#10b981' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', color: '#f59e0b' },
  error:   { bg: 'rgba(239, 68, 68, 0.15)',  border: 'rgba(239, 68, 68, 0.4)',  color: '#ef4444' },
  info:    { bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.4)', color: '#6366f1' },
};

function Toast({ toast, onClose }) {
  const colors = colorMap[toast.type] || colorMap.info;

  return (
    <div style={{
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.875rem 1.25rem',
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 'var(--border-radius-sm)',
      backdropFilter: 'blur(12px)',
      color: 'var(--text-primary)',
      minWidth: '280px',
      maxWidth: '420px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    }}>
      <span style={{ color: colors.color, flexShrink: 0 }}>{iconMap[toast.type]}</span>
      <span style={{ flex: 1, fontSize: '0.9rem' }}>{toast.message}</span>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0,
      }}>
        <X size={16} />
      </button>
    </div>
  );
}
