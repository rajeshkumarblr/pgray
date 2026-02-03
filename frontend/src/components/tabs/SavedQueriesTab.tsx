import React, { useEffect, useState, useRef } from 'react';
import { getSavedQueries, getDistinctValues, deleteQuery, saveQueryFinal, analyzeQuery } from '../../api';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import SimpleEditor from '../SimpleEditor';
import SaveSessionModal from '../SaveSessionModal';

interface ParamDef {
    name: string;
    original_value: string;
    table?: string | null;
    column?: string | null;
    transform?: string | null;
}

interface ParameterizedQuery {
    id: string;
    name: string;
    sql: string;
    params: (string | ParamDef)[];
    original_sql: string;
    created_at: string;
}

interface SavedQueriesTabProps {
    onExecute: (sql: string) => void;
    onAnalyze: (sql: string) => void;
    onEdit: (sql: string, name: string) => void;
    refreshTrigger?: number;
    connectionInfo: any;
    setSqlQuery: (sql: string) => void;
}

const customSyntaxStyle = {
    ...vscDarkPlus,
    'variable': {
        color: '#facc15', // Yellow/Gold
        fontWeight: 'bold'
    }
};

// --- Searchable Select Component ---
interface SearchableSelectProps {
    value: string;
    onChange: (val: string) => void;
    onSearch: (term: string) => void;
    options: string[];
    loading: boolean;
    placeholder?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ value, onChange, onSearch, options, loading, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync input with external value change
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // Debounce Search
    useEffect(() => {
        if (!isOpen) return; // Only search if open
        const timer = setTimeout(() => {
            onSearch(inputValue);
        }, 300);
        return () => clearTimeout(timer);
    }, [inputValue, isOpen]);

    const handleSelect = (opt: string) => {
        onChange(opt);
        setInputValue(opt);
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const val = e.target.value;
                        setInputValue(val);
                        onChange(val); // Propagate change immediately (Free Text)
                        setIsOpen(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        onSearch(inputValue); // Trigger initial search
                    }}
                    placeholder={placeholder}
                    style={{
                        width: '100%',
                        background: '#0f172a', border: '1px solid #475569', color: 'white',
                        padding: '8px 10px', borderRadius: '4px', outline: 'none'
                    }}
                />
                {loading && (
                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px' }}>
                        ⏳
                    </div>
                )}
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: '#1e293b', border: '1px solid #475569', borderRadius: '0 0 4px 4px',
                    maxHeight: '200px', overflowY: 'auto', zIndex: 10,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }}>
                    {options.length > 0 ? (
                        options.map((opt, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleSelect(opt)}
                                style={{
                                    padding: '8px 10px', cursor: 'pointer',
                                    borderBottom: '1px solid #334155',
                                    fontSize: '13px',
                                    background: '#1e293b'
                                }}
                                onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.background = '#334155'}
                                onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.background = '#1e293b'}
                            >
                                {opt}
                            </div>
                        ))
                    ) : (
                        <div style={{ padding: '10px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                            {loading ? 'Searching...' : 'No results found'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Rename Modal Component ---
interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRename: (newName: string) => void;
    currentName: string;
}

const RenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onRename, currentName }) => {
    const [newName, setNewName] = useState(currentName);

    useEffect(() => {
        setNewName(currentName);
    }, [currentName, isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100
        }}>
            <div style={{
                background: '#1e293b', borderRadius: '8px', padding: '24px', width: '400px',
                border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#f8fafc', fontSize: '16px' }}>Rename Query</h3>
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onRename(newName);
                        if (e.key === 'Escape') onClose();
                    }}
                    style={{
                        width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #334155',
                        background: '#0f172a', color: 'white', fontSize: '14px', marginBottom: '20px'
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '4px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => onRename(newName)} style={{ padding: '8px 16px', borderRadius: '4px', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Rename</button>
                </div>
            </div>
        </div>
    );
};

const SavedQueriesTab: React.FC<SavedQueriesTabProps> = ({ onExecute, onAnalyze, onEdit, refreshTrigger, connectionInfo, setSqlQuery }) => {
    const [queries, setQueries] = useState<ParameterizedQuery[]>([]);
    const [selectedQuery, setSelectedQuery] = useState<ParameterizedQuery | null>(null);
    const [paramValues, setParamValues] = useState<{ [key: string]: string }>({});
    const [paramOptions, setParamOptions] = useState<{ [key: string]: string[] }>({});
    const [loadingOptions, setLoadingOptions] = useState<{ [key: string]: boolean }>({});

    // Editing State
    const [isEditing, setIsEditing] = useState(false);
    const [editSql, setEditSql] = useState('');
    const [editTitle, setEditTitle] = useState(''); // NEW: Track title edits
    const [originalEditSql, setOriginalEditSql] = useState(''); // Tracking for dirty check
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [analyzingSave, setAnalyzingSave] = useState(false);
    const [saveParams, setSaveParams] = useState<any[]>([]); // Derived params for modal

    // Context Menu & Rename State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, queryId: string } | null>(null);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
    const [renameOldName, setRenameOldName] = useState('');

    useEffect(() => {
        loadQueries();
    }, [refreshTrigger, connectionInfo]);

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const loadQueries = async () => {
        try {
            const res = await getSavedQueries(connectionInfo);
            if (res && res.parameterized) {
                setQueries(res.parameterized);
            } else {
                setQueries([]);
            }
        } catch (e) {
            console.error("Failed to load queries", e);
            setQueries([]);
        }
    };

    const handleDeleteQuery = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Prevent selection
        if (!confirm("Are you sure you want to delete this query?")) return;

        try {
            await deleteQuery(id, connectionInfo);
            // Refresh list
            if (selectedQuery?.id === id) setSelectedQuery(null);
            loadQueries();
        } catch (error) {
            alert("Failed to delete query");
        }
    };

    const handleDuplicateQuery = async (e: React.MouseEvent, query: ParameterizedQuery) => {
        e.stopPropagation();
        const newName = `${query.name} (Copy)`;
        try {
            await saveQueryFinal(newName, query.sql, query.params, query.original_sql, connectionInfo);
            loadQueries();
        } catch (e) {
            alert("Failed to duplicate query");
        }
    };

    const fetchOptions = async (pName: string, table: string, column: string, search: string = '', transform: string | null = null) => {
        try {
            setLoadingOptions((prev: any) => ({ ...prev, [pName]: true }));
            if (!connectionInfo) return;
            const res = await getDistinctValues(connectionInfo, table, column, search, transform);
            if (res && res.values) {
                setParamOptions((prev: any) => ({
                    ...prev,
                    [pName]: res.values.map(String) // Ensure strings
                }));
            }
        } catch (e) {
            console.error(`Failed to fetch options for ${pName}`, e);
        } finally {
            setLoadingOptions((prev: any) => ({ ...prev, [pName]: false }));
        }
    };

    const handleSelect = async (q: ParameterizedQuery) => {
        setSelectedQuery(q);
        // Reset edit state
        setIsEditing(false);
        setEditSql('');
        setOriginalEditSql('');

        // Reset params
        const initialParams: any = {};
        const newLoading: { [key: string]: boolean } = {};

        for (const p of q.params) {
            const pName = typeof p === 'string' ? p : p.name;
            initialParams[pName] = '';

            if (typeof p !== 'string' && p.table && p.column) {
                newLoading[pName] = true;
                // Async fetch initial (no search)
                fetchOptions(pName, p.table, p.column, '', p.transform || null);
            }
        }

        setParamValues(initialParams);
        setLoadingOptions((prev: any) => ({ ...prev, ...newLoading }));
    };

    const handleContextMenu = (e: React.MouseEvent, q: ParameterizedQuery) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, queryId: q.id });
    };

    const initiateRename = (q: ParameterizedQuery) => {
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
            loadQueries();

            if (selectedQuery?.id === targetQuery.id) {
                setSelectedQuery(null);
            }
        } catch (e) {
            alert("Failed to rename query");
            console.error(e);
        }
    };


    const handleToggleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isEditing) {
            // Cancel edit
            if (editSql !== originalEditSql) {
                if (!confirm("Discard unsaved changes?")) return;
            }
            setIsEditing(false);
        } else {
            // Start edit
            if (!selectedQuery) return;
            // Use original_sql for editing to preserve formatting if possible, 
            // but selectedQuery.sql is usually the one we want. 
            // Actually selectedQuery.sql is the template with :params.
            setEditSql(selectedQuery.sql);
            setOriginalEditSql(selectedQuery.sql);
            setEditTitle(selectedQuery.name);
            setIsEditing(true);
        }
    };

    const handleSaveClick = async () => {
        if (!selectedQuery) return;
        setAnalyzingSave(true);
        try {
            // Analyze for params
            // Pass editTitle as existing title to speed up analysis
            const res = await analyzeQuery(editSql, editTitle);
            if (res && res.data) {
                // res.data.parameters is the correct property from backend
                setSaveParams(res.data.parameters || []);
                setShowSaveModal(true);
            }
        } catch (e) {
            alert("Failed to analyze query");
        } finally {
            setAnalyzingSave(false);
        }
    };

    const handleConfirmSave = async (title: string, finalSql: string, activeParams: any[]) => {
        if (!selectedQuery) return;
        try {
            await saveQueryFinal(
                title, // Allow title edit? Modal allows it.
                finalSql,
                activeParams,
                finalSql, // Original SQL is same as final for template
                connectionInfo
            );
            setShowSaveModal(false);
            setIsEditing(false);
            loadQueries(); // Refresh list to get updates
            // Update selected query effectively? loadQueries will reset queries.
            // We might lose selection or need to find it again.
            // Let's just refresh.
        } catch (e) {
            alert("Failed to save query");
        }
    };

    const handleDoubleClick = (q: ParameterizedQuery) => {
        onEdit(q.original_sql, q.name);
    };


    const prepareSql = (silent = false): string | null => {
        if (!selectedQuery) return null;
        // Use edited SQL if editing
        let sql = isEditing ? editSql : selectedQuery.sql;
        let missing = [];

        // Note: checking params against selectedQuery.params. 
        // If user added NEW params in editSql without saving, we won't know about them here 
        // unless we parse editSql. 
        // But we DO know about existing params.
        // For accurate execution of EDITED sql with NEW params, user must Save first to update params list.
        // However, if user REPLACED usage of a param with hardcoded value, this loop will just skip replacement (regex won't match).
        // That is fine.

        // We still iterate known params to fill them if they exist in SQL.
        for (const p of selectedQuery.params) {
            const pName = typeof p === 'string' ? p : p.name;
            const val = paramValues[pName];

            // Only enforce value IF the param is actually present in the CURRENT sql
            const regex = new RegExp(`:${pName}\\b`, 'g');
            if (!regex.test(sql)) continue; // Param not used in current SQL (maybe removed by user)

            if (val === undefined || val === '') {
                missing.push(pName);
                continue;
            }

            const isNumber = /^\d+(\.\d+)?$/.test(val);
            const replacement = isNumber ? val : `'${val.replace(/'/g, "''")}'`;
            sql = sql.replace(regex, replacement);
        }

        if (missing.length > 0) {
            if (!silent) alert(`Please provide values for: ${missing.join(', ')}\n(If you added new parameters, please Save the query first to update the input fields)`);
            return null; // Return null if missing parameters (and strict mode)
            // Ideally for live preview we might return the raw SQL?
            // But if we push raw SQL with :params to App.tsx, global execute will fail with syntax error. 
            // Better to push it so user sees *something* is inconsistent? 
            // Or push it so they can *see* it. 
            // Let's return the partially substituted SQL for now? 
            // App behavior: if I select a query, I want to execute it.
            // If I push partial SQL, PG will error.
            // That's fine.
            return sql;
        }
        return sql;
    };

    // Keep global sqlQuery in sync with current params
    useEffect(() => {
        const sql = prepareSql(true);
        if (sql) {
            setSqlQuery(sql);
        }
    }, [selectedQuery, paramValues, isEditing, editSql]);


    return (
        <div style={{ display: 'flex', height: '100%', color: '#e2e8f0', overflow: 'hidden' }}>
            {/* List Sidebar */}
            <div style={{ width: '250px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ padding: '10px', fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                        Saved Queries
                    </div>
                    {queries.length === 0 && <div style={{ padding: '10px', color: '#64748b', fontSize: '13px' }}>No saved queries found.</div>}

                    {queries.map(q => (
                        <div
                            key={q.id}
                            onClick={() => handleSelect(q)}
                            onDoubleClick={() => handleDoubleClick(q)}
                            onContextMenu={(e) => handleContextMenu(e, q)}
                            style={{
                                padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #1e293b',
                                background: selectedQuery?.id === q.id ? '#334155' : 'transparent',
                                transition: 'background 0.2s',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                            title="Right-click for options, Double-click to load in main editor"
                        >
                            <div style={{ overflow: 'hidden', width: '100%' }}>
                                <div style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{new Date(q.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Management Footer */}
                <div style={{ padding: '10px', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', gap: '5px', justifyContent: 'space-between' }}>
                    <button
                        onClick={(e) => handleToggleEdit(e)}
                        disabled={!selectedQuery}
                        style={{
                            flex: 1,
                            background: isEditing ? '#fbbf2422' : 'transparent',
                            color: isEditing ? '#fbbf24' : '#94a3b8',
                            border: isEditing ? '1px solid #fbbf24' : '1px solid #475569',
                            padding: '6px', borderRadius: '4px', cursor: selectedQuery ? 'pointer' : 'not-allowed', fontSize: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            opacity: selectedQuery ? 1 : 0.5
                        }}
                        title={isEditing ? "Cancel Editing" : "Inline Edit"}
                    >
                        {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                    {isEditing ? (
                        <button
                            onClick={handleSaveClick}
                            disabled={!selectedQuery || analyzingSave}
                            style={{
                                flex: 2,
                                background: analyzingSave ? '#334155' : '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                            }}
                            title="Save Changes"
                        >
                            {analyzingSave ? 'Saving...' : 'Save'}
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={(e) => selectedQuery && handleDuplicateQuery(e, selectedQuery)}
                                disabled={!selectedQuery || isEditing}
                                style={{
                                    flex: 1,
                                    background: 'transparent', color: '#94a3b8', border: '1px solid #475569',
                                    padding: '6px', borderRadius: '4px', cursor: selectedQuery ? 'pointer' : 'not-allowed', fontSize: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                    opacity: selectedQuery ? 1 : 0.5
                                }}
                                title="Duplicate"
                            >
                                Copy
                            </button>
                            <button
                                onClick={(e) => selectedQuery && handleDeleteQuery(e, selectedQuery.id)}
                                disabled={!selectedQuery || isEditing}
                                style={{
                                    flex: 1,
                                    background: 'transparent', color: '#ef4444', border: '1px solid #ef4444',
                                    padding: '6px', borderRadius: '4px', cursor: selectedQuery ? 'pointer' : 'not-allowed', fontSize: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                    opacity: selectedQuery ? 1 : 0.5
                                }}
                                title="Delete"
                            >
                                Del
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Details Main Content */}
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                {selectedQuery ? (
                    <>
                        <div style={{ flexShrink: 0, marginBottom: '20px' }}>
                            {/* Title Header */}
                            {isEditing ? (
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Query Name</label>
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        style={{
                                            width: '100%',
                                            background: '#1e293b', border: '1px solid #fbbf24', color: '#facc15',
                                            fontSize: '18px', fontWeight: 'bold', padding: '8px', borderRadius: '4px',
                                            outline: 'none'
                                        }}
                                        placeholder="Query Name"
                                    />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h2 style={{ margin: 0, fontSize: '20px' }}>{selectedQuery.name}</h2>
                                </div>
                            )}

                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>
                                SQL Template {isEditing && <span style={{ color: '#fbbf24' }}>(Editing)</span>}
                            </label>
                        </div>

                        {/* Editor -- Flex Grow to fill space */}
                        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', marginBottom: '20px' }}>
                            {isEditing ? (
                                <div style={{
                                    height: '100%', // Fill flex parent
                                    border: '1px solid #fbbf24', // Highlight border
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <SimpleEditor
                                        value={editSql}
                                        onChange={setEditSql}
                                        language="sql"
                                    />
                                </div>
                            ) : (
                                <div style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    height: '100%', // Fill flex parent
                                    display: 'flex', flexDirection: 'column'
                                }}>
                                    {/* Scrollable Container for SyntaxHighlighter */}
                                    <div style={{ flex: 1, overflow: 'auto' }}>
                                        <SyntaxHighlighter
                                            language="sql"
                                            style={customSyntaxStyle}
                                            customStyle={{
                                                margin: 0,
                                                padding: '15px',
                                                fontSize: '13px',
                                                background: 'transparent',
                                                whiteSpace: 'pre-wrap',       // Enable wrapping
                                                wordBreak: 'break-word',      // Break long words
                                                overflow: 'hidden'            // Disable internal scrollbar
                                            }}
                                            wrapLines={true}
                                        >
                                            {selectedQuery.sql}
                                        </SyntaxHighlighter>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Parameters Section - Show even if editing so execution works */}
                            {(selectedQuery.params.length > 0 || isEditing) && (
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>
                                        Parameters {isEditing && "(Updates applied after Save)"}
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '15px', alignItems: 'center', background: '#1e293b', padding: '15px', borderRadius: '4px', border: '1px solid #334155' }}>
                                        {selectedQuery.params.map(p => {
                                            const pName = typeof p === 'string' ? p : p.name;
                                            const isRich = typeof p !== 'string' && p.table && p.column;
                                            const isLoading = loadingOptions[pName];

                                            return (
                                                <React.Fragment key={pName}>
                                                    <div style={{ color: '#facc15', fontFamily: 'monospace', fontWeight: 'bold' }}>:{pName}</div>
                                                    {isRich ? (
                                                        <SearchableSelect
                                                            value={paramValues[pName] || ''}
                                                            onChange={(val) => setParamValues({ ...paramValues, [pName]: val })}
                                                            onSearch={(term) => {
                                                                if (typeof p !== 'string' && p.table && p.column) {
                                                                    fetchOptions(pName, p.table, p.column, term, p.transform || null);
                                                                }
                                                            }}
                                                            options={paramOptions[pName] || []}
                                                            loading={isLoading}
                                                            placeholder="Type to search..."
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder={`Value for ${pName}`}
                                                            value={paramValues[pName] || ''}
                                                            onChange={(e) => setParamValues({ ...paramValues, [pName]: e.target.value })}
                                                            style={{
                                                                background: '#0f172a', border: '1px solid #475569', color: 'white',
                                                                padding: '8px', borderRadius: '4px'
                                                            }}
                                                        />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                        {selectedQuery.params.length === 0 && <div style={{ color: '#64748b', fontStyle: 'italic', gridColumn: '1 / -1' }}>No parameters in saved query.</div>}
                                    </div>
                                </div>
                            )}

                            {/* Execution Actions Removed - Handled Globally */}
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        Select a query to view details <br /> Double-click to load in main editor
                    </div>
                )}

                {selectedQuery && (
                    <SaveSessionModal
                        isOpen={showSaveModal}
                        onClose={() => setShowSaveModal(false)}
                        onSave={handleConfirmSave}
                        initialTitle={isEditing ? editTitle : selectedQuery.name}
                        initialParams={saveParams}
                        originalSql={editSql}
                        loading={false}
                    />
                )}

                <RenameModal
                    isOpen={showRenameModal}
                    onClose={() => setShowRenameModal(false)}
                    currentName={renameOldName}
                    onRename={handleRenameConfirm}
                />

                {contextMenu && (
                    <div
                        style={{
                            position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999,
                            background: '#1e293b', border: '1px solid #475569', borderRadius: '4px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)', overflow: 'hidden'
                        }}
                    >
                        <div
                            onClick={() => {
                                const q = queries.find(q => q.id === contextMenu.queryId);
                                if (q) initiateRename(q);
                            }}
                            style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            ✏️ Rename
                        </div>
                        <div
                            onClick={(e) => {
                                const q = queries.find(q => q.id === contextMenu.queryId);
                                if (q) {
                                    handleDuplicateQuery(e as any, q);
                                    setContextMenu(null);
                                }
                            }}
                            style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            📄 Duplicate
                        </div>
                        <div
                            onClick={(e) => {
                                const q = queries.find(q => q.id === contextMenu.queryId);
                                if (q) {
                                    handleDeleteQuery(e as any, q.id);
                                    setContextMenu(null);
                                }
                            }}
                            style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            🗑️ Delete
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SavedQueriesTab;
