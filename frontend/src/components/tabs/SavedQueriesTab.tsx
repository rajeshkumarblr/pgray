import React, { useEffect, useState, useRef } from 'react';
import { getSavedQueries, getDistinctValues, deleteQuery } from '../../api';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ParamDef {
    name: string;
    original_value: string;
    table?: string | null;
    column?: string | null;
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
    refreshTrigger?: number;
    connectionInfo: any;
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
                    onChange={(e) => {
                        setInputValue(e.target.value);
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
                                onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#1e293b'}
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


const SavedQueriesTab: React.FC<SavedQueriesTabProps> = ({ onExecute, refreshTrigger, connectionInfo }) => {
    const [queries, setQueries] = useState<ParameterizedQuery[]>([]);
    const [selectedQuery, setSelectedQuery] = useState<ParameterizedQuery | null>(null);
    const [paramValues, setParamValues] = useState<{ [key: string]: string }>({});
    const [paramOptions, setParamOptions] = useState<{ [key: string]: string[] }>({});
    const [loadingOptions, setLoadingOptions] = useState<{ [key: string]: boolean }>({});

    useEffect(() => {
        loadQueries();
    }, [refreshTrigger]);

    const loadQueries = async () => {
        try {
            const res = await getSavedQueries();
            if (res && res.parameterized) {
                setQueries(res.parameterized);
            }
        } catch (e) {
            console.error("Failed to load queries", e);
        }
    };

    const handleDeleteQuery = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Prevent selection
        if (!confirm("Are you sure you want to delete this query?")) return;

        try {
            await deleteQuery(id);
            // Refresh list
            if (selectedQuery?.id === id) setSelectedQuery(null);
            loadQueries();
        } catch (error) {
            alert("Failed to delete query");
        }
    };

    const fetchOptions = async (pName: string, table: string, column: string, search: string = '') => {
        try {
            setLoadingOptions(prev => ({ ...prev, [pName]: true }));
            if (!connectionInfo) return;
            const res = await getDistinctValues(connectionInfo, table, column, search);
            if (res && res.values) {
                setParamOptions(prev => ({
                    ...prev,
                    [pName]: res.values.map(String) // Ensure strings
                }));
            }
        } catch (e) {
            console.error(`Failed to fetch options for ${pName}`, e);
        } finally {
            setLoadingOptions(prev => ({ ...prev, [pName]: false }));
        }
    };

    const handleSelect = async (q: ParameterizedQuery) => {
        setSelectedQuery(q);
        // Reset params
        const initialParams: any = {};
        const newLoading: { [key: string]: boolean } = {};

        for (const p of q.params) {
            const pName = typeof p === 'string' ? p : p.name;
            initialParams[pName] = '';

            if (typeof p !== 'string' && p.table && p.column) {
                newLoading[pName] = true;
                // Async fetch initial (no search)
                fetchOptions(pName, p.table, p.column);
            }
        }

        setParamValues(initialParams);
        setLoadingOptions(prev => ({ ...prev, ...newLoading }));
    };

    const handleExecute = () => {
        if (!selectedQuery) return;
        let sql = selectedQuery.sql;
        let missing = [];

        for (const p of selectedQuery.params) {
            const pName = typeof p === 'string' ? p : p.name;
            const val = paramValues[pName];

            if (val === undefined || val === '') {
                missing.push(pName);
                continue;
            }

            const isNumber = /^\d+(\.\d+)?$/.test(val);
            const replacement = isNumber ? val : `'${val.replace(/'/g, "''")}'`;
            const regex = new RegExp(`:${pName}\\b`, 'g');
            sql = sql.replace(regex, replacement);
        }

        if (missing.length > 0) {
            alert(`Please provide values for: ${missing.join(', ')}`);
            return;
        }

        onExecute(sql);
    };

    return (
        <div style={{ display: 'flex', height: '100%', color: '#e2e8f0' }}>
            {/* List */}
            <div style={{ width: '250px', borderRight: '1px solid #334155', overflowY: 'auto' }}>
                <div style={{ padding: '10px', fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Saved Queries
                </div>
                {queries.length === 0 && <div style={{ padding: '10px', color: '#64748b', fontSize: '13px' }}>No saved queries found.</div>}

                {queries.map(q => (
                    <div
                        key={q.id}
                        onClick={() => handleSelect(q)}
                        style={{
                            padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #1e293b',
                            background: selectedQuery?.id === q.id ? '#334155' : 'transparent',
                            transition: 'background 0.2s',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            group: 'item' // for hover logic (simplified)
                        }}
                    >
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{new Date(q.created_at).toLocaleDateString()}</div>
                        </div>
                        <button
                            onClick={(e) => handleDeleteQuery(e, q.id)}
                            style={{
                                background: 'transparent', border: 'none', color: '#64748b',
                                cursor: 'pointer', padding: '4px', fontSize: '14px'
                            }}
                            title="Delete Query"
                        >
                            🗑️
                        </button>
                    </div>
                ))}
            </div>

            {/* Details */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {selectedQuery ? (
                    <>
                        <h2 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>{selectedQuery.name}</h2>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>SQL Template</label>
                            <div style={{
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <SyntaxHighlighter
                                    language="sql"
                                    style={customSyntaxStyle}
                                    customStyle={{ margin: 0, padding: '15px', fontSize: '13px', background: 'transparent' }}
                                    wrapLines={true}
                                >
                                    {selectedQuery.sql}
                                </SyntaxHighlighter>
                            </div>
                        </div>

                        {selectedQuery.params.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>Parameters</label>
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
                                                                fetchOptions(pName, p.table, p.column, term);
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
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <button
                                onClick={handleExecute}
                                style={{
                                    background: '#10b981', color: 'white', border: 'none', padding: '10px 24px',
                                    borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <span>▶</span> Execute
                            </button>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        Select a query to view details
                    </div>
                )}
            </div>
        </div>
    );
};

export default SavedQueriesTab;
