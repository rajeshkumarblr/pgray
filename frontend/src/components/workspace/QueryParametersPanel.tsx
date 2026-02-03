import React, { useState, useEffect, useRef } from 'react';
import { getDistinctValues, ParameterizedQuery } from '../../api';

interface QueryParametersPanelProps {
    sql: string;
    paramValues: { [key: string]: string };
    onChange: (values: { [key: string]: string }) => void;
    connectionInfo: any;
    metaParams?: any[]; // From saved query metadata
}

// Reuse SearchableSelect logic (Inline for now to avoid refactor scope creep)
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

    useEffect(() => { setInputValue(value); }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => { onSearch(inputValue); }, 300);
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
                        onChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => { setIsOpen(true); onSearch(inputValue); }}
                    placeholder={placeholder}
                    style={{
                        width: '100%', background: '#0f172a', border: '1px solid #475569',
                        color: 'white', padding: '6px 10px', borderRadius: '4px', outline: 'none', fontSize: '13px'
                    }}
                />
                {loading && <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px' }}>⏳</div>}
            </div>
            {isOpen && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '5px',
                    background: '#1e293b', border: '1px solid #475569', borderRadius: '4px 4px 0 0',
                    maxHeight: '150px', overflowY: 'auto', zIndex: 50, boxShadow: '0 -4px 6px -1px rgba(0,0,0,0.5)'
                }}>
                    {options.length > 0 ? (
                        options.map((opt, idx) => (
                            <div key={idx} onClick={() => handleSelect(opt)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #334155',
                                    fontSize: '13px',
                                    color: '#f1f5f9',
                                    background: 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#3b82f6';
                                    e.currentTarget.style.color = 'white';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#f1f5f9';
                                }}
                            >
                                {opt}
                            </div>
                        ))
                    ) : (
                        <div style={{ padding: '8px', color: '#64748b', fontSize: '11px' }}>{loading ? 'Searching...' : 'No results found'}</div>
                    )}
                </div>
            )}
        </div>
    );
};

const QueryParametersPanel: React.FC<QueryParametersPanelProps> = ({ sql, paramValues, onChange, connectionInfo, metaParams }) => {
    const [params, setParams] = useState<string[]>([]);
    const [options, setOptions] = useState<{ [key: string]: string[] }>({});
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

    // Detect params from SQL
    useEffect(() => {
        if (!sql) {
            setParams([]);
            return;
        }
        // Regex to find :paramName
        const matches = sql.match(/:[a-zA-Z0-9_]+/g);
        if (matches) {
            const unique = Array.from(new Set(matches.map(m => m.substring(1))));
            setParams(unique);
        } else {
            setParams([]);
        }
    }, [sql]);

    const fetchOptions = async (pName: string, table: string, column: string, search: string = '') => {
        try {
            setLoading(prev => ({ ...prev, [pName]: true }));
            const res = await getDistinctValues(connectionInfo, table, column, search);
            if (res && res.values) {
                setOptions(prev => ({ ...prev, [pName]: res.values.map(String) }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(prev => ({ ...prev, [pName]: false }));
        }
    };

    // Initialize options for rich params
    useEffect(() => {
        if (!metaParams || !connectionInfo) return;
        metaParams.forEach(p => {
            const pName = typeof p === 'string' ? p : p.name;
            if (typeof p !== 'string' && p.table && p.column && params.includes(pName)) {
                // Initial fetch (optional, or wait for focus?)
                // Let's not fetch automatically to save traffic unless needed?
                // User might just type.
                // But typically dropdowns are expected to populate.
                // Let's do nothing here, rely on onSearch/onFocus in Select.
            }
        });
    }, [metaParams, params, connectionInfo]);

    if (params.length === 0) return null;

    return (
        <div style={{
            background: '#1e293b', borderTop: '1px solid #334155',
            padding: '10px 15px', display: 'flex', flexDirection: 'column', gap: '10px'
        }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                Query Parameters
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
                {params.map(pName => {
                    // Check if we have metadata for this param
                    const meta = metaParams?.find(mp => (typeof mp === 'string' ? mp : mp.name) === pName);
                    const isRich = meta && typeof meta !== 'string' && meta.table && meta.column;

                    return (
                        <div key={pName} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ color: '#facc15', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px', minWidth: '80px' }}>
                                :{pName}
                            </label>
                            <div style={{ flex: 1 }}>
                                {isRich ? (
                                    <SearchableSelect
                                        value={paramValues[pName] || ''}
                                        onChange={(val) => onChange({ ...paramValues, [pName]: val })}
                                        onSearch={(term) => fetchOptions(pName, meta.table, meta.column, term)}
                                        options={options[pName] || []}
                                        loading={loading[pName]}
                                        placeholder="Select val..."
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="Value"
                                        value={paramValues[pName] || ''}
                                        onChange={(e) => onChange({ ...paramValues, [pName]: e.target.value })}
                                        style={{
                                            width: '100%', background: '#0f172a', border: '1px solid #475569',
                                            color: 'white', padding: '6px 10px', borderRadius: '4px', outline: 'none', fontSize: '13px'
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default QueryParametersPanel;
