import React, { useEffect, useState } from 'react';
import { getHistory } from '../api';

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectQuery: (query: string) => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onSelectQuery }) => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getHistory();
            setHistory(data.history);
        } catch (err) {
            console.error(err);
            setError('Failed to load history');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '8px',
                width: '600px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Query History</h2>
                    <button 
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}
                    >
                        &times;
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && <div style={{ color: '#64748b' }}>Loading...</div>}
                    {error && <div style={{ color: '#ef4444' }}>{error}</div>}
                    
                    {!loading && !error && history.length === 0 && (
                        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No history found.</div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {history.map((item) => (
                            <div 
                                key={item.id}
                                onClick={() => {
                                    onSelectQuery(item.query);
                                    onClose();
                                }}
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                <div style={{ marginBottom: '5px', fontSize: '11px', color: '#94a3b8' }}>
                                    {new Date(item.timestamp).toLocaleString()}
                                </div>
                                <div style={{ 
                                    fontFamily: 'monospace', 
                                    fontSize: '13px', 
                                    color: '#334155',
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: '60px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {item.query}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                     <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                     >
                        Close
                     </button>
                </div>
            </div>
        </div>
    );
};

export default HistoryModal;
