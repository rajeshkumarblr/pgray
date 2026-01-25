import React, { useEffect, useState } from 'react';
import { getSavedQueries } from '../../api';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ParameterizedQuery {
    id: string;
    name: string;
    sql: string;
    params: string[];
    original_sql: string;
    created_at: string;
}

interface SavedQueriesTabProps {
    onExecute: (sql: string) => void;
    refreshTrigger?: number;
}

const customSyntaxStyle = {
    ...vscDarkPlus,
    'variable': {
        color: '#facc15', // Yellow/Gold
        fontWeight: 'bold'
    }
};

const SavedQueriesTab: React.FC<SavedQueriesTabProps> = ({ onExecute, refreshTrigger }) => {
    const [queries, setQueries] = useState<ParameterizedQuery[]>([]);
    const [selectedQuery, setSelectedQuery] = useState<ParameterizedQuery | null>(null);
    const [paramValues, setParamValues] = useState<{ [key: string]: string }>({});

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

    const handleSelect = (q: ParameterizedQuery) => {
        setSelectedQuery(q);
        // Reset params
        const initialParams: any = {};
        q.params.forEach(p => initialParams[p] = '');
        setParamValues(initialParams);
    };

    const handleExecute = () => {
        if (!selectedQuery) return;
        let sql = selectedQuery.sql;
        let missing = [];
        for (const p of selectedQuery.params) {
            const val = paramValues[p];
            if (val === undefined || val === '') {
                missing.push(p);
                continue;
            }
            // Very basic heuristic: if it looks like a number, don't quote.
            const isNumber = /^\d+(\.\d+)?$/.test(val);
            const replacement = isNumber ? val : `'${val.replace(/'/g, "''")}'`;
            const regex = new RegExp(`:${p}\\b`, 'g');
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
                            transition: 'background 0.2s'
                        }}
                    >
                        <div style={{ fontSize: '14px' }}>{q.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{new Date(q.created_at).toLocaleDateString()}</div>
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
                                    {selectedQuery.params.map(p => (
                                        <React.Fragment key={p}>
                                            <div style={{ color: '#facc15', fontFamily: 'monospace', fontWeight: 'bold' }}>:{p}</div>
                                            <input
                                                type="text"
                                                placeholder={`Value for ${p}`}
                                                value={paramValues[p] || ''}
                                                onChange={(e) => setParamValues({ ...paramValues, [p]: e.target.value })}
                                                style={{
                                                    background: '#0f172a', border: '1px solid #475569', color: 'white',
                                                    padding: '8px', borderRadius: '4px'
                                                }}
                                            />
                                        </React.Fragment>
                                    ))}
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
