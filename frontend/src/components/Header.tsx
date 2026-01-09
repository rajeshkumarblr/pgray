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
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '14px', color: '#e2e8f0', marginRight: '16px' }}> {/* added margin right */}
               <button 
                   onClick={onConnect}
                   style={{ 
                       background: '#3b82f6', 
                       color: 'white', 
                       border: 'none', 
                       padding: '8px 16px', 
                       borderRadius: '4px', 
                       cursor: 'pointer',
                       fontWeight: 500,
                       fontSize: '14px'
                   }}
               >
                   Connect to PG
               </button>
            </div>
        </div>
    );
};

export default Header;
