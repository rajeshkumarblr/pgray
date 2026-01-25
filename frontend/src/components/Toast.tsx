import React, { useEffect } from 'react';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: '#1e293b',
            borderLeft: `4px solid ${bg}`,
            padding: '12px 20px',
            borderRadius: '4px',
            color: '#f8fafc',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'slideIn 0.3s ease-out'
        }}>
            <div style={{ fontWeight: 600 }}>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</div>
            <div>{message}</div>
        </div>
    );
};

export default Toast;
