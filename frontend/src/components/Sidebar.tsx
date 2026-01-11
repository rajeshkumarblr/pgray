import React, { useState } from 'react';

interface SidebarProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    onRunExplain: (analyze: boolean, getResults: boolean) => void;
    onVisualizeJson: (jsonStr: string) => void;
    loading: boolean;
    explainResult: any;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    connectionInfo,
    sqlQuery,
    setSqlQuery,
    onRunExplain,
    onVisualizeJson,
    loading,
    explainResult,
    isCollapsed,
    onToggleCollapse
}) => {
    const [analyze, setAnalyze] = useState(true);
    const [getResults, setGetResults] = useState(false);
    const [inputMode, setInputMode] = useState<'sql' | 'json'>('sql');
    const [jsonInput, setJsonInput] = useState('');

    const containerStyle: React.CSSProperties = {
        width: isCollapsed ? '40px' : '380px',
        backgroundColor: '#1e293b', // Dark mode background
        borderRight: '1px solid #334155', // Darker border
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
        boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
        zIndex: 5,
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        color: '#e2e8f0' // Light text
    };

    if (isCollapsed) {
        return (
            <div style={containerStyle} onClick={onToggleCollapse} title="Click to expand query panel">
                <div style={{
                    height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', background: '#334155', color: '#94a3b8'
                }}>
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontWeight: 600, letterSpacing: '1px' }}>
                        NEW PLAN
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={{ padding: '20px', borderBottom: '1px solid #334155', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9' }}>New Plan</h2>
                    <button
                        onClick={onToggleCollapse}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', padding: 0 }}
                    >
                        &laquo;
                    </button>
                </div>

                {/* Input Mode Tabs */}
                <div style={{ display: 'flex', marginBottom: '15px', background: '#0f172a', padding: '2px', borderRadius: '6px' }}>
                    <button
                        onClick={() => setInputMode('sql')}
                        style={{
                            flex: 1, padding: '6px', border: 'none', borderRadius: '4px',
                            background: inputMode === 'sql' ? '#334155' : 'transparent',
                            color: inputMode === 'sql' ? '#fff' : '#64748b',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                    >
                        SQL Query
                    </button>
                    <button
                        onClick={() => setInputMode('json')}
                        style={{
                            flex: 1, padding: '6px', border: 'none', borderRadius: '4px',
                            background: inputMode === 'json' ? '#334155' : 'transparent',
                            color: inputMode === 'json' ? '#fff' : '#64748b',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                    >
                        Paste JSON
                    </button>
                </div>

                {inputMode === 'sql' ? (
                    <>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
                            {connectionInfo
                                ? `Connected: ${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}`
                                : 'Not connected'}
                        </div>
                        <textarea
                            value={sqlQuery}
                            onChange={(e) => setSqlQuery(e.target.value)}
                            placeholder="SELECT * FROM ..."
                            style={{
                                width: '100%', height: '140px', padding: '12px',
                                borderRadius: '6px', border: '1px solid #475569',
                                fontFamily: 'monospace', fontSize: '13px', resize: 'vertical',
                                outline: 'none', background: '#0f172a', color: '#e2e8f0',
                                boxSizing: 'border-box'
                            }}
                        />
                        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={analyze}
                                    onChange={e => setAnalyze(e.target.checked)}
                                    style={{ marginRight: '8px', accentColor: '#2563eb' }}
                                />
                                Analyze (Actual Times)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={getResults}
                                    onChange={e => setGetResults(e.target.checked)}
                                    style={{ marginRight: '8px', accentColor: '#2563eb' }}
                                />
                                Get Results (Limit 100)
                            </label>
                        </div>
                        <button
                            onClick={() => onRunExplain(analyze, getResults)}
                            disabled={loading || !connectionInfo}
                            style={{
                                marginTop: '15px', width: '100%', padding: '10px',
                                background: '#2563eb', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: (loading || !connectionInfo) ? 'not-allowed' : 'pointer',
                                opacity: (loading || !connectionInfo) ? 0.6 : 1, fontWeight: 600,
                                boxSizing: 'border-box'
                            }}
                        >
                            {loading ? 'Processing...' : 'Explain Plan'}
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
                            Paste a valid JSON explain plan directly.
                        </div>
                        <textarea
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            placeholder='[ { "Plan": { ... } } ]'
                            style={{
                                width: '100%', height: '140px', padding: '12px',
                                borderRadius: '6px', border: '1px solid #475569',
                                fontFamily: 'monospace', fontSize: '13px', resize: 'vertical',
                                outline: 'none', background: '#0f172a', color: '#e2e8f0',
                                boxSizing: 'border-box'
                            }}
                        />
                        <button
                            onClick={() => onVisualizeJson(jsonInput)}
                            style={{
                                marginTop: '15px', width: '100%', padding: '10px',
                                background: '#0891b2', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
                                boxSizing: 'border-box'
                            }}
                        >
                            Visualize JSON
                        </button>
                    </>
                )}
            </div>

            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {!explainResult ? (
                    <div style={{ textAlign: 'center', marginTop: '40px', color: '#64748b' }}>
                        <div style={{ fontSize: '40px', marginBottom: '10px', opacity: 0.5 }}>🔍</div>
                        <div style={{ fontSize: '14px' }}>Run a query to see the plan.</div>
                    </div>
                ) : (
                    <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                        <div style={{ fontWeight: 600, marginBottom: '10px', color: '#94a3b8' }}>Plan Summary</div>
                        {explainResult[0] ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ background: '#334155', padding: '10px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Check Planning</div>
                                    <div style={{ fontWeight: 'bold' }}>{explainResult[0]['Planning Time'] ? explainResult[0]['Planning Time'] + 'ms' : 'N/A'}</div>
                                </div>
                                <div style={{ background: '#14532d', padding: '10px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', color: '#86efac' }}>Execution</div>
                                    <div style={{ fontWeight: 'bold', color: '#4ade80' }}>{explainResult[0]['Execution Time'] ? explainResult[0]['Execution Time'] + 'ms' : 'N/A'}</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ p: '10px', fontStyle: 'italic', color: '#94a3b8' }}>Visualizing external JSON</div>
                        )}
                        <div style={{ color: '#94a3b8', lineHeight: 1.5 }}>
                            The plan is visualized on the right. Click on any node to see details.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
