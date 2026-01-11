import React from 'react';

interface HeaderProps {
    onNewPlan: () => void;
    onHistory: () => void;
    onConnect: () => void;
}

const Header: React.FC<HeaderProps> = ({ onNewPlan, onHistory, onConnect }) => {
    return (
        <div style={{
            height: '60px',
            backgroundColor: '#1e293b',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px 0 0', // Remove left padding, keep right padding (24) for now, will adjust button margin
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
            flexShrink: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '30px', paddingLeft: '20px' }}> {/* Match sidebar padding (20px) */}
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#facc15', letterSpacing: '-0.02em' }}>
                    pgRay
                </h1>
                <nav style={{ display: 'flex', gap: '20px', fontSize: '14px', fontWeight: 500 }}>
                    <button
                        onClick={onNewPlan}
                        style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: 0, font: 'inherit' }}
                    >
                        New plan
                    </button>
                    <button
                        onClick={onHistory}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, font: 'inherit' }}
                    >
                        History
                    </button>
                </nav>
            </div>
            <div
                onClick={onConnect}
                title="Connection Settings"
                style={{
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>
        </div>
    );
};

export default Header;
