import React, { useState, useEffect } from 'react';
import { getSchema, executeQuery, getSavedQueries, saveQuery, getSavedQueryContent, executeExplain, explainSql } from '../../api';
import SimpleEditor from '../SimpleEditor';
import AIAssistant from '../AIAssistant';
import ResultsTable from '../ResultsTable';

interface QueryEditorTabProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    onRun: () => void;
}

const QueryEditorTab: React.FC<QueryEditorTabProps> = ({ connectionInfo, sqlQuery, setSqlQuery, onRun }) => {
    const [schema, setSchema] = useState<any>(null);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

    // Explanation State
    const [showExplanation, setShowExplanation] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);

    // Local execution state
    const [executionResult, setExecutionResult] = useState<any>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [execError, setExecError] = useState<string | null>(null);

    const [limit, setLimit] = useState(10);
    const [isResultsExpanded, setIsResultsExpanded] = useState(false);

    // Resize & Layout State
    const [resultsHeight, setResultsHeight] = useState(300);
    const [isResizing, setIsResizing] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);

    // Previous height to restore after maximize
    const [prevHeight, setPrevHeight] = useState(300);

    const startResizing = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    const stopResizing = () => {
        setIsResizing(false);
    };

    const resize = (e: MouseEvent) => {
        if (isResizing) {
            // Calculate new height based on mouse position from bottom
            // We need ref to container to do this accurately, but window.innerHeight is a decent proxy for full screen app
            // Better: offset from bottom of window
            const newHeight = window.innerHeight - e.clientY;
            // Clamp height
            if (newHeight > 100 && newHeight < window.innerHeight - 100) {
                setResultsHeight(newHeight);
            }
        }
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing]);

    const toggleMaximize = () => {
        if (isMaximized) {
            // Restore
            setIsMaximized(false);
            setResultsHeight(prevHeight);
        } else {
            // Maximize
            setPrevHeight(resultsHeight);
            setIsMaximized(true);
            // Ideally 100%, but we just hide editor
        }
    };

    // ... existing handlers ...
    // Restored UI States & Handlers
    const [savedQueries, setSavedQueries] = useState<string[]>([]);
    const [selectedSavedQuery, setSelectedSavedQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'results' | 'plan'>('results');
    const [planText, setPlanText] = useState<string | null>(null);
    const [errorLine, setErrorLine] = useState<number | null>(null);

    const toggleTable = (table: string) => {
        setExpandedTables(prev => ({ ...prev, [table]: !prev[table] }));
    };

    const fetchSavedQueries = () => {
        getSavedQueries().then(data => setSavedQueries(data.queries));
    };

    useEffect(() => {
        fetchSavedQueries();
    }, []);

    const handleSaveQuery = async () => {
        const name = prompt("Enter name for this query:");
        if (name) {
            try {
                await saveQuery(name, sqlQuery);
                alert("Query saved!");
                fetchSavedQueries();
            } catch (e) {
                alert("Failed to save query");
            }
        }
    };

    const handleLoadQuery = async (name: string) => {
        if (!name) return;
        try {
            const data = await getSavedQueryContent(name);
            setSqlQuery(data.sql);
            setSelectedSavedQuery(name);
        } catch (e) {
            alert("Failed to load query");
        }
    };

    const handleExplain = async () => {
        if (!sqlQuery) return;
        setShowExplanation(true);
        setIsExplaining(true);
        setExplanation(null);

        try {
            const res = await explainSql(sqlQuery, schema);
            setExplanation(res.explanation);
        } catch (e) {
            console.error(e);
            setExplanation("Failed to generate explanation.");
        } finally {
            setIsExplaining(false);
        }
    };

    const handleCopyResults = () => {
        if (activeTab === 'plan') {
            // Copy Plan
            const text = planText || "";
            copyText(text);
            return;
        }

        if (!executionResult || !executionResult.rows) return;

        const headers = executionResult.columns.join('\t');
        const rows = executionResult.rows.map((row: any[]) => row.join('\t')).join('\n');
        const text = `${headers}\n${rows}`;
        copyText(text);
    };

    const copyText = (text: string) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(err => {
                console.error('Async: Could not copy text: ', err);
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    };

    const fallbackCopy = (text: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
    };

    useEffect(() => {
        if (connectionInfo) {
            setLoadingSchema(true);
            getSchema(connectionInfo)
                .then(data => setSchema(data.data))
                .catch(err => console.error("Schema fetch error", err))
                .finally(() => setLoadingSchema(false));
        }
    }, [connectionInfo]);

    const handleExecute = async () => {
        if (!connectionInfo || !sqlQuery) return; // Silent return

        setIsExecuting(true);
        setExecError(null);
        setExecutionResult(null);
        setPlanText(null); // Clear plan

        // Ensure results are visible
        if (!isResultsExpanded) setIsResultsExpanded(true);
        // If minimized/collapsed via height, restore reasonable height
        if (resultsHeight < 50) setResultsHeight(300);

        setActiveTab('results'); // Reset to results

        try {
            const res = await executeQuery(connectionInfo, sqlQuery, limit);
            setExecutionResult(res.data);

            // Also fetch plan (cheap) for the tab
            try {
                const planRes = await executeExplain(connectionInfo, sqlQuery, false); // Analyze = false for speed/safety
                setPlanText(planRes.data.text);
            } catch (e) {
                console.warn("Could not fetch plan automatically", e);
            }

        } catch (err: any) {
            console.error("Execution failed", err);
            setExecError(err.response?.data?.detail || err.message || "Query execution failed");
        } finally {
            setIsExecuting(false);
        }
    };

    const handleApplyCode = (code: string) => {
        setSqlQuery(code);
        // Optional: Auto-run? No, user explicitly asked for "Copy to Editor"
    };

    return (
        <div style={{ display: 'flex', height: '100%', color: '#e2e8f0', overflow: 'hidden' }}>
            {/* Left: Schema Browser */}
            <div style={{ width: '250px', borderRight: '1px solid #334155', background: '#0f172a', padding: '10px', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', marginTop: 0 }}>SCHEMA BROWSER</h3>
                {loadingSchema && <span style={{ fontSize: '11px', color: '#64748b' }}>Loading...</span>}
                {schema && (
                    <div style={{ fontSize: '13px' }}>
                        {Object.keys(schema).sort().map(table => {
                            const tableData = schema[table];
                            const columns = Array.isArray(tableData) ? tableData : tableData.columns;
                            const indexes = !Array.isArray(tableData) && tableData.indexes ? tableData.indexes : [];
                            const isExpanded = expandedTables[table];

                            return (
                                <div key={table} style={{ marginBottom: '4px' }}>
                                    <div
                                        onClick={() => toggleTable(table)}
                                        style={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '4px 6px',
                                            borderRadius: '4px',
                                            background: isExpanded ? '#1e293b' : 'transparent',
                                            color: isExpanded ? '#60a5fa' : '#94a3b8'
                                        }}
                                    >
                                        <span style={{ marginRight: '6px', fontSize: '10px', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                                        <span style={{ fontWeight: 600 }}>{table}</span>
                                    </div>
                                    {isExpanded && (
                                        <div style={{ paddingLeft: '14px', marginTop: '2px', borderLeft: '1px solid #334155', marginLeft: '9px' }}>
                                            {columns && columns.length > 0 && (
                                                <div style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '10px', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>Columns</div>
                                                    {columns.map((col: any) => (
                                                        <div key={col.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: '12px' }}>
                                                            <span style={{ color: '#cbd5e1' }}>{col.name}</span>
                                                            <span style={{ fontSize: '10px', color: '#64748b' }}>{col.type}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {indexes && indexes.length > 0 && (
                                                <div style={{ marginBottom: '4px' }}>
                                                    <div style={{ fontSize: '10px', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>Indexes</div>
                                                    {indexes.map((idx: any) => (
                                                        <div key={idx.name} title={idx.def} style={{ padding: '2px 4px', color: '#a855f7', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}>
                                                            <span style={{ opacity: 0.7 }}>🏷️</span> {idx.name}
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
                )}
            </div>

            {/* Center: SQL Editor & Results */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
                <div style={{ padding: '8px 10px', background: '#334155', borderBottom: '1px solid #475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>Query Editor</span>
                        <select
                            value={selectedSavedQuery}
                            onChange={(e) => handleLoadQuery(e.target.value)}
                            style={{
                                background: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', borderRadius: '4px', fontSize: '11px', padding: '2px', maxWidth: '150px'
                            }}
                        >
                            <option value="">📂 Recent Queries...</option>
                            {savedQueries.map(q => (
                                <option key={q} value={q}>{q}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleExecute}
                            disabled={isExecuting}
                            style={{
                                background: '#22c55e', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: isExecuting ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            {isExecuting ? 'Running...' : '▶ Execute'}
                        </button>

                        <button
                            onClick={handleExplain}
                            disabled={isExplaining}
                            style={{
                                background: '#8b5cf6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: isExplaining ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                            title="Generate a plain English explanation for this query"
                        >
                            {isExplaining ? 'Explaining...' : '💡 Explain'}
                        </button>

                        <button
                            onClick={handleSaveQuery}
                            style={{
                                background: '#3b82f6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            💾 Save
                        </button>
                        <button
                            onClick={() => copyText(sqlQuery)}
                            style={{
                                background: 'transparent',
                                border: '1px solid #475569',
                                color: '#cbd5e1',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            title="Copy SQL"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Editor Section (Split Pane) */}
                <div style={{
                    flex: isMaximized ? '0' : '1', // Hide if maximized
                    display: isMaximized ? 'none' : 'flex',
                    flexDirection: 'row', // Horizontal split
                    // borderBottom: '1px solid #475569', // Moved to resize handle
                    transition: 'flex 0.1s', // Faster transition
                    minHeight: 0,
                    overflow: 'hidden'
                }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <SimpleEditor
                            value={sqlQuery}
                            onChange={(val) => {
                                setSqlQuery(val);
                                if (errorLine) setErrorLine(null); // Clear error highlight on edit
                            }}
                            language="sql"
                            placeholder="SELECT * FROM ..."
                            style={{ flex: 1 }}
                            errorLine={errorLine}
                        />
                    </div>

                    {/* Explanation Pane */}
                    {showExplanation && (
                        <div style={{
                            width: '40%',
                            borderLeft: '1px solid #475569',
                            background: '#1e293b',
                            display: 'flex',
                            flexDirection: 'column',
                            minWidth: '200px'
                        }}>
                            <div style={{ padding: '8px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a' }}>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' }}>💡 Explanation</span>
                                <button
                                    onClick={() => setShowExplanation(false)}
                                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
                                >✕</button>
                            </div>
                            <div style={{ padding: '15px', overflowY: 'auto', flex: 1, fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
                                {isExplaining ? (
                                    <div style={{ fontStyle: 'italic', color: '#94a3b8' }}>Generating explanation...</div>
                                ) : (
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{explanation}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Resize Handle */}
                {isResultsExpanded && !isMaximized && (
                    <div
                        onMouseDown={startResizing}
                        style={{
                            height: '6px',
                            background: isResizing ? '#60a5fa' : '#334155',
                            cursor: 'row-resize',
                            zIndex: 10,
                            flexShrink: 0
                        }}
                        title="Drag to resize"
                    />
                )}

                {/* Results Section (Persistent Footer) */}
                <div style={{
                    // Height Strategy: 
                    // If maximized: flex: 1 (take all space)
                    // If expanded: fixed height (resultsHeight)
                    // If collapsed: minimal auto (toolbar only) - but we use isResultsExpanded to hide body
                    height: isMaximized ? '100%' : (isResultsExpanded ? `${resultsHeight}px` : 'auto'),
                    flex: isMaximized ? 1 : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0f172a',
                    overflow: 'hidden',
                    // borderTop: '1px solid #475569', // Handled by resize handle
                    transition: isResizing ? 'none' : 'height 0.2s ease',
                    minHeight: 0
                }}>
                    {/* Results Toolbar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            {/* Tabs */}
                            <div style={{ display: 'flex', gap: '1px' }}>
                                <button onClick={() => setActiveTab('results')} style={{ padding: '4px 8px', background: activeTab === 'results' ? '#334155' : 'transparent', border: 'none', color: activeTab === 'results' ? 'white' : '#94a3b8', fontSize: '11px', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}>Results</button>
                                <button onClick={() => setActiveTab('plan')} style={{ padding: '4px 8px', background: activeTab === 'plan' ? '#334155' : 'transparent', border: 'none', color: activeTab === 'plan' ? 'white' : '#94a3b8', fontSize: '11px', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>Query Plan</button>
                            </div>

                            <button
                                onClick={onRun}
                                style={{
                                    background: '#8b5cf6', color: 'white', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                ⚡ Fine Tune
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontSize: '11px', color: '#94a3b8' }}>Row Limit:</label>
                                <input
                                    type="number"
                                    value={limit}
                                    onChange={(e) => setLimit(Number(e.target.value))}
                                    style={{ background: '#0f172a', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '3px', padding: '2px 4px', fontSize: '11px', width: '50px' }}
                                />
                            </div>
                            {executionResult && (
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                    {executionResult.rowCount} rows
                                    {executionResult.executionTime && ` • ${executionResult.executionTime} ms`}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {executionResult && (
                                <button
                                    onClick={handleCopyResults}
                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    title="Copy to Clipboard"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                </button>
                            )}

                            {/* Maximize Toggle */}
                            <button
                                onClick={toggleMaximize}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center' }}
                                title={isMaximized ? "Restore size" : "Maximize results"}
                            >
                                {isMaximized ? '🗗' : '🗖'}
                            </button>

                            <button
                                onClick={() => setIsResultsExpanded(!isResultsExpanded)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center' }}
                                title={isResultsExpanded ? "Collapse" : "Expand"}
                            >
                                {isResultsExpanded ? '▼' : '▲'}
                            </button>
                        </div>
                    </div>

                    {isResultsExpanded && (
                        <div style={{ flex: 1, overflow: 'auto' }}>
                            {execError ? (
                                <div style={{ padding: '20px', color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                    ❌ Error:
                                    {(() => {
                                        // Parse "LINE 123:" pattern
                                        const lineMatch = execError.match(/LINE\s+(\d+):/i);
                                        if (lineMatch) {
                                            const lineNum = parseInt(lineMatch[1]);
                                            const parts = execError.split(lineMatch[0]);
                                            return (
                                                <>
                                                    {parts[0]}
                                                    <span
                                                        onClick={() => setErrorLine(lineNum)}
                                                        style={{
                                                            textDecoration: 'underline',
                                                            cursor: 'pointer',
                                                            fontWeight: 'bold',
                                                            background: 'rgba(255,255,255,0.1)',
                                                            padding: '2px 4px',
                                                            borderRadius: '4px'
                                                        }}
                                                        title="Jump to line"
                                                    >
                                                        {lineMatch[0]}
                                                    </span>
                                                    {parts[1]}
                                                </>
                                            );
                                        }
                                        return execError;
                                    })()}
                                </div>
                            ) : activeTab === 'results' ? (
                                executionResult ? <ResultsTable data={executionResult} /> : <div style={{ padding: '20px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>Execute a query to see results.</div>
                            ) : (
                                <div style={{ padding: '10px', height: '100%', boxSizing: 'border-box' }}>
                                    {planText ? (
                                        <pre style={{ fontSize: '11px', fontFamily: 'monospace', color: '#aaa', margin: 0, height: '100%', overflow: 'auto' }}>{planText}</pre>
                                    ) : (
                                        <div style={{ padding: '20px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>No plan available. Execute a query first.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: AI Assistant */}
            <div style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
                <AIAssistant
                    schema={schema}
                    onApplyCode={handleApplyCode}
                    connectionInfo={connectionInfo}
                />
            </div>
        </div>
    );
};

export default QueryEditorTab;
