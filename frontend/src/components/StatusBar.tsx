import React from 'react';

interface StatusBarProps {
    message: string | null;
    type?: 'info' | 'warning' | 'error' | 'success';
}

const StatusBar: React.FC<StatusBarProps> = ({ message, type = 'info' }) => {
    let bgColor = '#334155';
    let textColor = '#e2e8f0';
    let icon = 'ℹ️';

    switch (type) {
        case 'warning':
            bgColor = '#0f172a'; // Default background (was orange)
            textColor = '#facc15'; // Yellow text
            icon = '⚠️';
            break;
        case 'error':
            bgColor = '#ef4444';
            textColor = 'white';
            icon = '❌';
            break;
        case 'success':
            bgColor = '#22c55e';
            textColor = 'white';
            icon = '✅';
            break;
        case 'info':
        default:
            bgColor = '#0f172a';
            textColor = '#94a3b8';
            icon = '';
            break;
    }

    if (!message) {
        return (
            <div style={{
                width: '100%',
                padding: '4px 12px',
                background: '#0f172a',
                color: '#64748b',
                fontSize: '11px',
                borderTop: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxSizing: 'border-box',
                height: '24px'
            }}>
                <span style={{}}>Ready</span>
            </div>
        );
    }

    return (
        <div style={{
            width: '100%',
            padding: '4px 12px',
            background: bgColor,
            color: textColor,
            fontSize: '11px',
            borderTop: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxSizing: 'border-box',
            height: '24px'
        }}>
            {icon && <span>{icon}</span>}
            <span style={{ fontWeight: 500 }}>{message}</span>
        </div>
    );
};

export default StatusBar;
