import React, { useState, useEffect } from 'react';
import { deleteQuery, saveQueryFinal, ParameterizedQuery } from '../../api';

interface SavedQueriesSidebarProps {
    connectionInfo: any;
    onSelectQuery: (query: ParameterizedQuery) => void;
    queries: ParameterizedQuery[];
    loading: boolean;
    onReload: () => void;
}

const SavedQueriesSidebar: React.FC<SavedQueriesSidebarProps> = ({ connectionInfo, onSelectQuery, queries, loading, onReload }) => {
    // Queries are now passed in props
    // const [queries, setQueries] = useState<ParameterizedQuery[]>([]);
    // const [loading, setLoading] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, queryId: string } | null>(null);
    const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameOldName, setRenameOldName] = useState('');

    // Internal fetch removed
    /*
    useEffect(() => {
        loadQueries();
    }, [refreshTrigger, connectionInfo]);
    */

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    /*
    const loadQueries = async () => {
       // Removed
    };
    */

    const handleContextMenu = (e: React.MouseEvent, q: ParameterizedQuery) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, queryId: q.id });
    };

    const handleDelete = async () => {
        if (!contextMenu) return;
        if (!confirm("Are you sure you want to delete this query?")) return;

        try {
            await deleteQuery(contextMenu.queryId, connectionInfo);
            onReload();
        } catch (e) {
            alert("Failed to delete query");
        }
        setContextMenu(null);
    };

    const handleDuplicate = async () => {
        if (!contextMenu) return;
        const q = queries.find(query => query.id === contextMenu.queryId);
        if (!q) return;

        const newName = `${q.name} (Copy)`;
        try {
            await saveQueryFinal(newName, q.sql, q.params, q.original_sql, connectionInfo);
            onReload();
        } catch (e) {
            alert("Failed to duplicate query");
        }
        setContextMenu(null);
    };

    const handleRenameStart = () => {
        if (!contextMenu) return;
        const q = queries.find(query => query.id === contextMenu.queryId);
        if (!q) return;

        setRenameTargetId(q.id);
        setRenameOldName(q.name);
        setShowRenameModal(true);
        setContextMenu(null);
    };

    const handleRenameConfirm = async (newName: string) => {
        if (!newName || !newName.trim()) return;
        if (newName === renameOldName) {
            setShowRenameModal(false);
            return;
        }

        const targetQuery = queries.find(q => q.id === renameTargetId);
        if (!targetQuery) return;

        try {
            // Save as new name
            await saveQueryFinal(newName, targetQuery.sql, targetQuery.params, targetQuery.original_sql, connectionInfo);
            // Delete old
            await deleteQuery(targetQuery.id, connectionInfo);

            setShowRenameModal(false);
            onReload();
        } catch (e) {
            alert("Failed to rename query");
            console.error(e);
        }
    };

    return (
        <div style={{
            width: '250px',
            borderRight: '1px solid #334155',
            background: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <div style={{
                padding: '10px',
                borderBottom: '1px solid #334155',
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#94a3b8',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span>SAVED QUERIES</span>
                <button
                    onClick={onReload}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                    ↻
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }}>
                {loading && <div style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>Loading...</div>}

                {!loading && queries?.length === 0 && (
                    <div style={{ padding: '10px', color: '#64748b', fontSize: '11px', textAlign: 'center' }}>
                        No saved queries found.
                    </div>
                )}

                {queries.map(q => (
                    <div
                        key={q.id}
                        onClick={() => onSelectQuery(q)}
                        onContextMenu={(e) => handleContextMenu(e, q)}
                        style={{
                            padding: '8px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            marginBottom: '2px',
                            fontSize: '13px',
                            color: '#e2e8f0',
                            transition: 'background 0.2s',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title={q.name}
                    >
                        {q.name}
                    </div>
                ))}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    padding: '4px 0',
                    zIndex: 9999,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }} onClick={(e) => e.stopPropagation()}>
                    <div className="ctx-item" onClick={handleDuplicate} style={{ padding: '6px 12px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>Duplicate</div>
                    <div className="ctx-item" onClick={handleRenameStart} style={{ padding: '6px 12px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>Rename</div>
                    <div className="ctx-item" onClick={handleDelete} style={{ padding: '6px 12px', fontSize: '12px', color: '#ef4444', cursor: 'pointer', borderTop: '1px solid #334155' }}>Delete</div>
                </div>
            )}

            <style>{`
                .ctx-item:hover { background: #334155; }
            `}</style>

            {/* Rename Modal */}
            {showRenameModal && (
                <RenameModal
                    initialName={renameOldName}
                    onConfirm={handleRenameConfirm}
                    onCancel={() => setShowRenameModal(false)}
                />
            )}
        </div>
    );
};

// Simple inline modal for rename
const RenameModal = ({ initialName, onConfirm, onCancel }: any) => {
    const [name, setName] = useState(initialName);
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }} onClick={onCancel}>
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', width: '300px', border: '1px solid #475569' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ color: '#e2e8f0', marginTop: 0 }}>Rename Query</h3>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoFocus
                    style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', marginBottom: '15px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onCancel} style={{ padding: '6px 12px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => onConfirm(name)} style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                </div>
            </div>
        </div>
    );
}

export default SavedQueriesSidebar;
