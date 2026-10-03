import React, { useState, useEffect } from 'react';
import { deleteQuery, saveQueryFinal, ParameterizedQuery, getDatabases, connectDb, saveConnectionConfig } from '../../api';
import { Table, Bookmark, ChevronRight, ChevronDown, Key, Hash, Play, Search, RefreshCw } from 'lucide-react';

interface SavedQueriesSidebarProps {
    connectionInfo: any;
    onSelectQuery: (query: ParameterizedQuery) => void;
    queries: ParameterizedQuery[];
    loading: boolean;
    onReload: () => void;
    activeQueryName?: string;
    schema?: any;
    onPreviewTable?: (tableName: string) => void;
    onInsertSnippet?: (snippet: string) => void;
}

const SavedQueriesSidebar: React.FC<SavedQueriesSidebarProps> = ({
    connectionInfo,
    onSelectQuery,
    queries,
    loading,
    onReload,
    activeQueryName,
    schema,
    onPreviewTable,
    onInsertSnippet,
}) => {
    const [sidebarTab, setSidebarTab] = useState<'schema' | 'saved'>('schema');
    const [filterText, setFilterText] = useState('');
    const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

    // Database Switching State
    const [databases, setDatabases] = useState<string[]>([]);
    const [showDbDropdown, setShowDbDropdown] = useState(false);
    const [switchingDb, setSwitchingDb] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, queryId: string } | null>(null);
    const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameOldName, setRenameOldName] = useState('');

    // Load databases when connection changes
    useEffect(() => {
        if (connectionInfo) {
            getDatabases(connectionInfo).then(dbs => {
                if (dbs && dbs.length > 0) {
                    setDatabases(dbs);
                }
            });
        }
    }, [connectionInfo]);

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => {
            setContextMenu(null);
            setShowDbDropdown(false);
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);


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
            await saveQueryFinal(newName, targetQuery.sql, targetQuery.params, targetQuery.original_sql, connectionInfo);
            await deleteQuery(targetQuery.id, connectionInfo);

            setShowRenameModal(false);
            onReload();
        } catch (e) {
            alert("Failed to rename query");
            console.error(e);
        }
    };

    const handleDbSwitch = async (dbName: string) => {
        if (dbName === connectionInfo.database) return;
        setSwitchingDb(true);
        try {
            const newConn = { ...connectionInfo, database: dbName };
            await connectDb(newConn);
            await saveConnectionConfig(newConn);
            window.location.reload();
        } catch (e) {
            console.error("Failed to switch DB", e);
            alert("Failed to switch database");
        } finally {
            setSwitchingDb(false);
        }
    };

    const tableNames = schema ? Object.keys(schema).sort() : [];
    const filteredTables = tableNames.filter(t => {
        if (!filterText.trim()) return true;
        const q = filterText.toLowerCase();
        if (t.toLowerCase().includes(q)) return true;
        const cols = schema[t]?.columns || [];
        return cols.some((c: any) => c.name.toLowerCase().includes(q));
    });

    const filteredQueries = (queries || []).filter(q =>
        !filterText.trim() || q.name.toLowerCase().includes(filterText.toLowerCase())
    );

    const toggleTable = (t: string) => {
        setExpandedTables(prev => ({ ...prev, [t]: !prev[t] }));
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
            {/* Server Header */}
            <div style={{
                padding: '10px',
                borderBottom: '1px solid #334155',
                background: '#1e293b'
            }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '2px' }}>DATABASE</div>
                <div style={{ position: 'relative' }}>
                    <div
                        onClick={(e) => { e.stopPropagation(); setShowDbDropdown(!showDbDropdown); }}
                        style={{
                            fontSize: '12px',
                            color: '#e2e8f0',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            background: '#0f172a',
                            borderRadius: '5px',
                            border: '1px solid #334155',
                            fontWeight: 600
                        }}
                    >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {switchingDb ? 'Switching...' : (connectionInfo?.database || 'postgres')}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>▼</span>
                    </div>

                    {showDbDropdown && (
                        <div style={{
                            position: 'absolute',
                            top: '100%', left: 0, right: 0,
                            background: '#1e293b',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            zIndex: 100,
                            marginTop: '2px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                        }} onClick={(e) => e.stopPropagation()}>
                            {databases.map(db => (
                                <div
                                    key={db}
                                    onClick={() => handleDbSwitch(db)}
                                    style={{
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        color: db === connectionInfo.database ? '#60a5fa' : '#cbd5e1',
                                        cursor: 'pointer',
                                        background: db === connectionInfo.database ? '#334155' : 'transparent',
                                        borderBottom: '1px solid #334155'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = db === connectionInfo.database ? '#334155' : 'transparent'}
                                >
                                    {db}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Mode Switcher: Schema vs Saved Queries */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid #334155',
                background: '#0f172a',
                padding: '6px 8px',
                gap: '4px'
            }}>
                <button
                    onClick={() => setSidebarTab('schema')}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '5px 6px',
                        borderRadius: '5px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: sidebarTab === 'schema' ? '#1e293b' : 'transparent',
                        color: sidebarTab === 'schema' ? '#60a5fa' : '#64748b'
                    }}
                >
                    <Table size={12} />
                    <span>Tables ({tableNames.length})</span>
                </button>
                <button
                    onClick={() => setSidebarTab('saved')}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '5px 6px',
                        borderRadius: '5px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: sidebarTab === 'saved' ? '#1e293b' : 'transparent',
                        color: sidebarTab === 'saved' ? '#60a5fa' : '#64748b'
                    }}
                >
                    <Bookmark size={12} />
                    <span>Saved ({queries?.length || 0})</span>
                </button>
            </div>

            {/* Filter Input */}
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Search size={12} style={{ color: '#64748b', flexShrink: 0 }} />
                <input
                    type="text"
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    placeholder={sidebarTab === 'schema' ? 'Filter tables or columns...' : 'Filter saved queries...'}
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#cbd5e1',
                        fontSize: '11px'
                    }}
                />
                {sidebarTab === 'saved' && (
                    <button
                        onClick={onReload}
                        title="Reload Saved Queries"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px', display: 'flex' }}
                    >
                        <RefreshCw size={11} />
                    </button>
                )}
            </div>

            {/* Tab Content */}
            {sidebarTab === 'schema' ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
                    {filteredTables.length === 0 && (
                        <div style={{ padding: '16px 8px', color: '#64748b', fontSize: '11px', textAlign: 'center' }}>
                            No matching tables found.
                        </div>
                    )}
                    {filteredTables.map(tableName => {
                        const tData = schema[tableName] || {};
                        const cols = tData.columns || [];
                        const idxs = tData.indexes || [];
                        const fks = tData.fks || [];
                        const fkMap: Record<string, string> = {};
                        fks.forEach((fk: any) => {
                            fkMap[fk.column] = `${fk.foreign_table}.${fk.foreign_column}`;
                        });
                        const isExpanded = !!expandedTables[tableName];

                        return (
                            <div key={tableName} style={{ marginBottom: '2px' }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '5px 6px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        color: '#e2e8f0',
                                        fontSize: '12px',
                                        background: isExpanded ? 'rgba(30, 41, 59, 0.7)' : 'transparent'
                                    }}
                                    onClick={() => toggleTable(tableName)}
                                    onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                                    onMouseLeave={e => e.currentTarget.style.background = isExpanded ? 'rgba(30, 41, 59, 0.7)' : 'transparent'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1 }}>
                                        {isExpanded ? <ChevronDown size={12} style={{ color: '#64748b', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#64748b', flexShrink: 0 }} />}
                                        <Table size={12} style={{ color: '#10b981', flexShrink: 0 }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={tableName}>
                                            {tableName}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                        <span style={{ fontSize: '10px', color: '#64748b' }}>{cols.length}c</span>
                                        {onPreviewTable && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPreviewTable(tableName);
                                                }}
                                                title={`Preview ${tableName} (SELECT * LIMIT 50)`}
                                                style={{
                                                    background: 'rgba(59, 130, 246, 0.15)',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    color: '#60a5fa',
                                                    borderRadius: '3px',
                                                    padding: '2px 4px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <Play size={9} fill="currentColor" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div style={{ paddingLeft: '18px', paddingRight: '4px', paddingBottom: '4px', borderLeft: '1px solid #1e293b', marginLeft: '11px' }}>
                                        {cols.map((col: any) => {
                                            const fkTarget = fkMap[col.name];
                                            return (
                                                <div
                                                    key={col.name}
                                                    onClick={() => onInsertSnippet && onInsertSnippet(col.name)}
                                                    title={fkTarget ? `FK -> ${fkTarget} (Click to insert)` : `${col.name} (${col.type}) — Click to insert`}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '3px 6px',
                                                        fontSize: '11px',
                                                        color: '#cbd5e1',
                                                        borderRadius: '3px',
                                                        cursor: onInsertSnippet ? 'pointer' : 'default'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {fkTarget ? (
                                                            <Key size={10} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                                        ) : (
                                                            <Hash size={10} style={{ color: '#64748b', flexShrink: 0 }} />
                                                        )}
                                                        <span style={{ fontFamily: 'Menlo, Monaco, monospace' }}>{col.name}</span>
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px', flexShrink: 0 }}>
                                                        {col.type === 'character varying' ? 'varchar' : col.type === 'timestamp without time zone' ? 'timestamp' : col.type}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {idxs.length > 0 && (
                                            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #1e293b' }}>
                                                <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600, padding: '2px 6px' }}>INDEXES ({idxs.length})</div>
                                                {idxs.map((idx: any) => (
                                                    <div
                                                        key={idx.name}
                                                        title={idx.def}
                                                        style={{
                                                            fontSize: '10px',
                                                            color: '#94a3b8',
                                                            padding: '2px 6px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            fontFamily: 'Menlo, Monaco, monospace'
                                                        }}
                                                    >
                                                        ⚡ {idx.name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }}>
                    {loading && <div style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>Loading...</div>}

                    {!loading && filteredQueries.length === 0 && (
                        <div style={{ padding: '16px 10px', color: '#64748b', fontSize: '11px', textAlign: 'center' }}>
                            No saved queries yet. Click Save in the editor toolbar to bookmark queries.
                        </div>
                    )}

                    {filteredQueries.map(q => (
                        <div
                            key={q.id}
                            onClick={() => onSelectQuery(q)}
                            onContextMenu={(e) => handleContextMenu(e, q)}
                            style={{
                                padding: '8px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                marginBottom: '2px',
                                fontSize: '12px',
                                color: activeQueryName === q.name ? '#fff' : '#e2e8f0',
                                background: activeQueryName === q.name ? '#3b82f6' : 'transparent',
                                transition: 'background 0.2s',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontWeight: activeQueryName === q.name ? 'bold' : 'normal'
                            }}
                            onMouseEnter={(e) => {
                                if (activeQueryName !== q.name) e.currentTarget.style.background = '#1e293b'
                            }}
                            onMouseLeave={(e) => {
                                if (activeQueryName !== q.name) e.currentTarget.style.background = 'transparent'
                            }}
                            title={q.name}
                        >
                            {q.name}
                        </div>
                    ))}
                </div>
            )}

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
