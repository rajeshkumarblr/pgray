import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { executeQuery, getSavedQueries, getSavedQueryContent, executeExplain } from '../../api';
import SimpleEditor from '../SimpleEditor';
import ResultsTable from '../ResultsTable';
import DiffView from '../DiffView';

export interface QueryEditorRef {
    runQuery: (overrideSql?: string) => Promise<void>;
}

interface QueryEditorTabProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    onRun: () => void; // Legacy? Still used for tuning trigger?

    // Lifted State Props
    chatHistory: { role: 'user' | 'assistant', content: string, status?: 'success' | 'error' | 'pending', hidden?: boolean, respTime?: string, planTime?: string, execTime?: string }[];
    setChatHistory: React.Dispatch<React.SetStateAction<{ role: 'user' | 'assistant', content: string, status?: 'success' | 'error' | 'pending', hidden?: boolean, respTime?: string, planTime?: string, execTime?: string }[]>>;

    sessionTitle: string;
    setSessionTitle: (t: string) => void;

    schema: any;
    loadingSchema: boolean;

    onTune: () => void;

    highlightedLines: number[];

    diffBaseQuery: string;
    onPlanUpdate: (planData: any) => void;
    onStatusChange?: (msg: string | null, type?: 'info' | 'warning' | 'error' | 'success') => void;
    onNewSession?: () => void;

    // Diff State
    showDiff: boolean;
    setShowDiff: (show: boolean) => void;
}

import ERDiagram from '../ERDiagram';

// ... (existing imports)

const QueryEditorTab = forwardRef<QueryEditorRef, QueryEditorTabProps>(({
    connectionInfo, sqlQuery, setSqlQuery,
    setChatHistory, sessionTitle, setSessionTitle,
    schema, loadingSchema, onTune, highlightedLines, diffBaseQuery,
    onPlanUpdate, onStatusChange, onNewSession,
    showDiff, setShowDiff
}, ref) => {
    const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
    const [showER, setShowER] = useState(false);

    // ... (existing state)


    // Local execution state

    // Local execution state
    const [executionResult, setExecutionResult] = useState<any>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [execError, setExecError] = useState<string | null>(null);

    const [limit, setLimit] = useState(50);
    const [disableLimit, setDisableLimit] = useState(false);
    const [isResultsExpanded, setIsResultsExpanded] = useState(true);

    // Resize & Layout State
    const [resultsHeight, setResultsHeight] = useState(300);
    const [isResizing, setIsResizing] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);

    // Previous height to restore after maximize
    const [prevHeight, setPrevHeight] = useState(300);

    // Saved Queries State
    const [savedQueries, setSavedQueries] = useState<string[]>([]);
    const [showSessionList, setShowSessionList] = useState(false);

    const [activeTab, setActiveTab] = useState<'results' | 'plan'>('results');
    const [planText, setPlanText] = useState<string | null>(null);
    const [errorLine, setErrorLine] = useState<number | null>(null);

    const startResizing = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    const stopResizing = () => {
        setIsResizing(false);
    };

    const resize = (e: MouseEvent) => {
        if (isResizing) {
            const newHeight = window.innerHeight - e.clientY;
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
            setIsMaximized(false);
            setResultsHeight(prevHeight);
        } else {
            setPrevHeight(resultsHeight);
            setIsMaximized(true);
        }
    };

    const toggleTable = (table: string) => {
        setExpandedTables(prev => ({ ...prev, [table]: !prev[table] }));
    };

    const fetchSavedQueries = () => {
        getSavedQueries().then(data => {
            console.log("DEBUG: Fetched Saved Queries:", data.queries);
            setSavedQueries(data.queries);
        }).catch(err => console.error("DEBUG: Failed to fetch saved queries", err));
    };

    useEffect(() => {
        fetchSavedQueries();
    }, []);

    // handleSaveQuery Removed


    const handleLoadQuery = async (name: string) => {
        if (!name) return;
        try {
            console.log("DEBUG: Loading session...", name);
            const data = await getSavedQueryContent(name);
            console.log("DEBUG: Loaded session data:", data);

            if (data) {
                setSqlQuery(data.sql || '');
                setChatHistory(data.history || []);
                setSessionTitle(name);
            } else {
                console.error("DEBUG: No data received for session");
            }
        } catch (e) {
            console.error("DEBUG: Failed to load session", e);
            alert("Failed to load session");
        }
    };

    const handleCopyResults = () => {
        if (activeTab === 'plan') {
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
        document.execCommand('copy');
        document.body.removeChild(textArea);
    };

    const handleExecute = async (overrideSql?: string) => {
        const sqlToRun = overrideSql || sqlQuery;

        if (!connectionInfo || !sqlToRun) return;

        setIsExecuting(true);
        setExecError(null);
        setExecutionResult(null);
        setPlanText(null);
        if (onStatusChange) onStatusChange('Executing query...', 'info');

        if (!isResultsExpanded) setIsResultsExpanded(true);
        if (resultsHeight < 50) setResultsHeight(300);

        setActiveTab('results');

        // Apply Limit Logic
        const effectiveLimit = disableLimit ? 0 : limit;

        try {
            const res = await executeQuery(connectionInfo, sqlToRun, effectiveLimit);
            setExecutionResult(res.data);

            if (res.data.isLimited) {
                if (onStatusChange) onStatusChange(`Results limited to first ${res.data.rowCount} rows.`, 'warning');
            } else {
                if (onStatusChange) onStatusChange(`Query executed. ${res.data.rowCount} rows fetched.`, 'success');
            }

            // Update Chat History with Metrics if applicable
            // We assume the last assistant message is the one associated with this run (if auto-executed)
            // Or we just update the last assistant message regardless?
            // User flow: AI -> Auto Run -> Metrics update.
            setChatHistory(prev => {
                const newHist = [...prev];
                const lastIdx = newHist.length - 1;
                if (lastIdx >= 0 && newHist[lastIdx].role === 'assistant') {
                    newHist[lastIdx] = {
                        ...newHist[lastIdx],
                        execTime: res.data.executionTime ? String(res.data.executionTime) : undefined
                    };
                }
                return newHist;
            });

            try {
                const planStart = performance.now();
                const planRes = await executeExplain(connectionInfo, sqlToRun, false);
                const planEnd = performance.now();
                const planDuration = (planEnd - planStart).toFixed(2);

                if (planRes && planRes.data) {
                    setPlanText(planRes.data.text);
                    if (onPlanUpdate) {
                        onPlanUpdate(planRes.data.json);
                    }
                }

                // Update Plan Time
                setChatHistory(prev => {
                    const newHist = [...prev];
                    const lastIdx = newHist.length - 1;
                    if (lastIdx >= 0 && newHist[lastIdx].role === 'assistant') {
                        newHist[lastIdx] = {
                            ...newHist[lastIdx],
                            planTime: planDuration
                        };
                    }
                    return newHist;
                });

            } catch (e) {
                console.warn("Could not fetch plan automatically", e);
            }

        } catch (err: any) {
            console.error("Execution failed", err);
            const errMsg = err.response?.data?.detail || err.message || "Query execution failed";
            setExecError(errMsg);
            if (onStatusChange) onStatusChange(errMsg, 'error');
        } finally {
            setIsExecuting(false);
        }
    };

    useImperativeHandle(ref, () => ({
        runQuery: handleExecute
    }));

    // --- Hover Preview Logic ---
    const [hoveredTable, setHoveredTable] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewPos, setPreviewPos] = useState<{ x: number, y: number } | null>(null);
    const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    const handleTableMouseEnter = (e: React.MouseEvent, table: string) => {
        // Clear any pending closes
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }

        // If already hovered on this table, do nothing (keep open)
        if (hoveredTable === table) return;

        // Clear existing open timer
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

        // Capture generic mouse position logic
        const x = e.clientX + 10;
        const y = e.clientY + 10;

        hoverTimerRef.current = setTimeout(async () => {
            setHoveredTable(table);
            setPreviewPos({ x, y });
            setPreviewData(null);

            try {
                const res = await executeQuery(connectionInfo, `SELECT * FROM ${table} LIMIT 5`, 5);
                if (res.status === 'success') {
                    setPreviewData(res.data);
                } else {
                    setPreviewData({ error: 'Failed to fetch preview' });
                }
            } catch (err: any) {
                console.error("Preview failed", err);
                setPreviewData({ error: err.message || 'Preview Failed' });
            }
        }, 2000); // 2 Seconds
    };

    const handleTableMouseLeave = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }

        // Grace period to allow moving into tooltip
        closeTimerRef.current = setTimeout(() => {
            setHoveredTable(null);
            setPreviewData(null);
        }, 300);
    };

    const handleTooltipMouseEnter = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const handleTooltipMouseLeave = () => {
        closeTimerRef.current = setTimeout(() => {
            setHoveredTable(null);
            setPreviewData(null);
        }, 300);
    };


    // --- End Hover Preview Logic ---


    return (
        <div style={{ display: 'flex', height: '100%', color: '#e2e8f0', overflow: 'hidden' }}>
            {/* Left: Schema Browser */}
            <div style={{ width: '250px', borderRight: '1px solid #334155', background: '#0f172a', padding: '10px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', margin: 0 }}>SCHEMA BROWSER</h3>
                    <button
                        onClick={() => setShowER(true)}
                        style={{
                            background: 'transparent', border: '1px solid #475569', color: '#cbd5e1',
                            padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px'
                        }}
                        title="View ER Relationship Diagram"
                    >
                        🔗 ER
                    </button>
                </div>

                {loadingSchema && <span style={{ fontSize: '11px', color: '#64748b' }}>Loading...</span>}
                {/* ... tables mapping ... */}

                {/* ER Diagram Modal */}
                {showER && schema && (
                    <ERDiagram schema={schema} connectionInfo={connectionInfo} onClose={() => setShowER(false)} />
                )}
                {schema && (
                    <div style={{ fontSize: '13px' }}>
                        {Object.keys(schema).sort().map(table => {
                            const tableData = schema[table];
                            const columns = Array.isArray(tableData) ? tableData : tableData.columns;
                            const isExpanded = expandedTables[table];

                            return (
                                <div key={table} style={{ marginBottom: '4px' }}>
                                    <div
                                        onClick={() => toggleTable(table)}
                                        onMouseEnter={(e) => handleTableMouseEnter(e, table)}
                                        onMouseLeave={handleTableMouseLeave}
                                        style={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '4px 6px',
                                            borderRadius: '4px',
                                            background: isExpanded ? '#1e293b' : 'transparent',
                                            color: isExpanded ? '#60a5fa' : '#94a3b8',
                                            position: 'relative' // For anchor? No, using fixed/absolute.
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
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Floating Preview Tooltip */}
                {hoveredTable && previewPos && (
                    <div
                        onMouseEnter={handleTooltipMouseEnter}
                        onMouseLeave={handleTooltipMouseLeave}
                        style={{
                            position: 'fixed',
                            top: previewPos.y,
                            left: previewPos.x,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            borderRadius: '6px',
                            padding: '8px',
                            zIndex: 9999,
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            maxWidth: '400px',
                            maxHeight: '300px',
                            overflow: 'auto'
                        }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#facc15', marginBottom: '4px' }}>
                            Preview: {hoveredTable}
                        </div>
                        {!previewData ? (
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Loading...</div>
                        ) : previewData.error ? (
                            <div style={{ fontSize: '10px', color: '#ef4444' }}>{previewData.error}</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                    <thead>
                                        <tr>
                                            {previewData.columns.map((col: string) => (
                                                <th key={col} style={{ borderBottom: '1px solid #334155', padding: '2px 4px', color: '#cbd5e1', textAlign: 'left' }}>{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.rows.map((row: any[], i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                                {row.map((cell: any, j: number) => (
                                                    <td key={j} style={{ padding: '2px 4px', color: '#94a3b8', maxWidth: '100px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                                        {String(cell)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Center: SQL Editor & Results */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
                <div style={{ padding: '8px 10px', background: '#334155', borderBottom: '1px solid #475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
                            <input
                                type="text"
                                value={sessionTitle}
                                onChange={(e) => {
                                    setSessionTitle(e.target.value);
                                    // Soft load? No, wait for explicit selection or enter?
                                    // User flow: Type to rename. Select to load.
                                }}
                                onClick={() => {
                                    // Optional: open dropdown on click? 
                                    // Let's stick to arrow for explicit Open, but maybe focus helper?
                                }}
                                placeholder="Untitled Session"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: '1px dashed #475569',
                                    color: '#facc15',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    width: '100%',
                                    outline: 'none',
                                    paddingRight: '25px'
                                }}
                                title="Type to rename session"
                            />

                            {/* Custom Dropdown Trigger */}
                            <div
                                onClick={() => setShowSessionList(!showSessionList)}
                                style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#94a3b8'
                                }}
                                title="Show All Sessions"
                            >
                                ▼
                            </div>

                            {/* Custom Dropdown List */}
                            {showSessionList && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    background: '#1e293b',
                                    border: '1px solid #475569',
                                    borderRadius: '4px',
                                    marginTop: '4px',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                                }}>
                                    {savedQueries.map(q => (
                                        <div
                                            key={q}
                                            onClick={() => {
                                                handleLoadQuery(q);
                                                setShowSessionList(false);
                                            }}
                                            style={{
                                                padding: '8px 12px',
                                                fontSize: '13px',
                                                color: '#e2e8f0',
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #334155',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            {q || "(Untitled)"}
                                        </div>
                                    ))}
                                    {savedQueries.length === 0 && (
                                        <div style={{ padding: '8px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                                            No saved sessions found.
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => {
                                if (onNewSession) {
                                    onNewSession();
                                }
                                // Clear local results
                                setExecutionResult(null);
                                setPlanText(null);
                                setExecError(null);
                                setActiveTab('results');
                            }}
                            style={{
                                background: '#3b82f6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                                whiteSpace: 'nowrap'
                            }}
                            title="Save current session and start new"
                        >
                            ➕ New Query
                        </button>



                        <button
                            onClick={() => handleExecute()}
                            disabled={isExecuting}
                            style={{
                                background: '#22c55e', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: isExecuting ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            {isExecuting ? 'Running...' : '▶ Execute'}
                        </button>

                        <button
                            onClick={onTune}
                            style={{
                                background: '#8b5cf6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                            title="Analyze Execution Plan"
                        >
                            ⚡ Query Tune
                        </button>

                        <button
                            onClick={async () => {
                                if (!sqlQuery.trim()) return;
                                const btn = document.getElementById('btn-save-param');
                                if (btn) btn.innerHTML = "Saving...";
                                try {
                                    // Dynamic import or use from props if available? We imported executeQuery directly.
                                    // Need to import saveParameterizedQuery at top. 
                                    // Since I can't easily change imports at the top without reading again or being risky,
                                    // I'll resort to a direct fetch or assume I can modify imports in next step.
                                    // Actually, I should modify imports first. But let's check if I can add it to the import list in this tool call?
                                    // No, replace_file_content is contiguous. 
                                    // I will use another tool call to update imports.
                                    // For now, I will use the imported API function (which I will add in next step).
                                    // allow me to add the logic here assuming import exists.
                                    const { saveParameterizedQuery } = await import('../../api');
                                    const res = await saveParameterizedQuery(sqlQuery);
                                    if (res.status === 'success') {
                                        alert(`Saved as: ${res.data.name}\nParams: ${res.data.params.join(', ')}`);
                                    }
                                } catch (e) {
                                    alert("Failed to save parameterized query");
                                    console.error(e);
                                } finally {
                                    if (btn) btn.innerText = "💾 Save Param";
                                }
                            }}
                            id="btn-save-param"
                            style={{
                                background: '#f59e0b', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                                cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                            title="AI Auto-Parameterize & Save"
                        >
                            💾 Save Param
                        </button>

                        {/* Save Button Removed - Auto Save is Active */}

                        <button
                            onClick={() => setShowDiff(!showDiff)}
                            style={{
                                background: showDiff ? '#475569' : 'transparent',
                                border: '1px solid #475569',
                                color: showDiff ? 'white' : '#cbd5e1',
                                padding: '4px 12px', borderRadius: '4px',
                                cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                            title="Toggle Diff View"
                        >
                            ⚖️ Diff
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
                        <button
                            onClick={() => {
                                if (confirm("Reset current editor state? (Does not delete saved queries)")) {
                                    setSqlQuery('');
                                    setChatHistory([]);
                                    setSessionTitle('Untitled Session');
                                    setExecutionResult(null);
                                    setPlanText(null);
                                }
                            }}
                            style={{
                                background: 'transparent',
                                border: '1px solid #475569',
                                color: '#cbd5e1',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: 600
                            }}
                            title="Clear Plan (Reset Editor & History)"
                        >
                            🗑️
                        </button>
                    </div>
                </div>

                {/* Editor Section */}
                <div style={{
                    flex: isMaximized ? '0' : '1',
                    display: isMaximized ? 'none' : 'flex',
                    flexDirection: 'row',
                    transition: 'flex 0.1s',
                    minHeight: 0,
                    overflow: 'hidden'
                }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {showDiff ? (
                            <DiffView
                                oldCode={diffBaseQuery}
                                newCode={sqlQuery}
                                onClose={() => setShowDiff(false)}
                            />
                        ) : (
                            <SimpleEditor
                                value={sqlQuery}
                                onChange={(val) => {
                                    setSqlQuery(val);
                                    if (errorLine) setErrorLine(null);
                                }}
                                language="sql"
                                placeholder="SELECT * FROM ..."
                                style={{ flex: 1 }}
                                errorLine={errorLine}
                                highlightLines={highlightedLines}
                            />
                        )}
                    </div>
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

                {/* Results Section */}
                <div style={{
                    height: isMaximized ? '100%' : (isResultsExpanded ? `${resultsHeight}px` : 'auto'),
                    flex: isMaximized ? 1 : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0f172a',
                    overflow: 'hidden',
                    transition: isResizing ? 'none' : 'height 0.2s ease',
                    minHeight: 0
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ display: 'flex', gap: '1px' }}>
                                <button onClick={() => setActiveTab('results')} style={{ padding: '4px 8px', background: activeTab === 'results' ? '#334155' : 'transparent', border: 'none', color: activeTab === 'results' ? 'white' : '#94a3b8', fontSize: '11px', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}>Results</button>
                                <button onClick={() => setActiveTab('plan')} style={{ padding: '4px 8px', background: activeTab === 'plan' ? '#334155' : 'transparent', border: 'none', color: activeTab === 'plan' ? 'white' : '#94a3b8', fontSize: '11px', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>Query Plan</button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <label style={{ fontSize: '11px', color: '#94a3b8' }}>Row Limit:</label>
                                <input
                                    type="number"
                                    value={limit}
                                    onChange={(e) => setLimit(Number(e.target.value))}
                                    disabled={disableLimit}
                                    style={{
                                        background: disableLimit ? '#1e293b' : '#0f172a',
                                        border: '1px solid #475569',
                                        color: disableLimit ? '#64748b' : '#cbd5e1',
                                        borderRadius: '3px', padding: '2px 4px', fontSize: '11px', width: '50px'
                                    }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <input
                                        type="checkbox"
                                        checked={disableLimit}
                                        onChange={(e) => setDisableLimit(e.target.checked)}
                                        id="no-limit-check"
                                    />
                                    <label htmlFor="no-limit-check" style={{ fontSize: '10px', color: '#94a3b8', cursor: 'pointer' }}>No Limit</label>
                                </div>
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
                                    ❌ Error: {execError}
                                </div>
                            ) : activeTab === 'results' ? (
                                executionResult ? <ResultsTable data={executionResult} /> : <div style={{ padding: '20px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>Execute a query to see results.</div>
                            ) : (
                                <div style={{ padding: '10px', height: '100%', boxSizing: 'border-box' }}>
                                    {planText ? (
                                        <pre style={{ fontSize: '11px', fontFamily: 'monospace', color: '#aaa', margin: 0, height: '100%', overflow: 'auto' }}>{planText}</pre>
                                    ) : (
                                        <div style={{ padding: '20px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>No plan available. Execute results first.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default QueryEditorTab;
