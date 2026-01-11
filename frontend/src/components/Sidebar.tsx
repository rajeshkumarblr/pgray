import React, { useState } from 'react';

interface SidebarProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    onRunExplain: (analyze: boolean, getResults: boolean) => void;
    // Removed separate onRunExecute
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
    loading,
    explainResult,
    isCollapsed,
    onToggleCollapse
}) => {
    const [analyze, setAnalyze] = useState(true);
    const [getResults, setGetResults] = useState(false);

    const containerStyle: React.CSSProperties = {
        width: isCollapsed ? '40px' : '380px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
        boxShadow: '2px 0 5px rgba(0,0,0,0.02)',
        zIndex: 5,
        transition: 'width 0.3s ease',
        overflow: 'hidden' // Hide content when collapsed
    };

    if (isCollapsed) {
        return (
            <div style={containerStyle} onClick={onToggleCollapse} title="Click to expand query panel">
                <div style={{
                    height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', background: '#f8fafc', color: '#64748b'
                }}>
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontWeight: 600, letterSpacing: '1px' }}>
                        NEW PLAN
                    </div>
                </div>
            </div>
        );
    }

    // --- QUERY / NEW PLAN VIEW ---
    return (
        <div style={containerStyle}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>New Plan</h2>
                    <button
                        onClick={onToggleCollapse}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', padding: 0 }}
                    >
                        &laquo;
                    </button>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px' }}>
                    {connectionInfo
                        ? `Connected to ${connectionInfo.host}:${connectionInfo.port} / ${connectionInfo.database}`
                        : 'Not connected'}
                </div>

                <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="Enter your SQL query here..."
                    style={{
                        width: '100%', height: '150px', padding: '12px',
                        borderRadius: '6px', border: '1px solid #cbd5e1',
                        fontFamily: 'monospace', fontSize: '13px', resize: 'vertical',
                        outline: 'none', background: '#f8fafc', color: '#334155',
                        boxSizing: 'border-box'
                    }}
                />

                {/* Options */}
                <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={analyze}
                            onChange={e => setAnalyze(e.target.checked)}
                            style={{ marginRight: '8px' }}
                        />
                        Analyze (Actual Times)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={getResults}
                            onChange={e => setGetResults(e.target.checked)}
                            style={{ marginRight: '8px' }}
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
                        opacity: (loading || !connectionInfo) ? 0.7 : 1, fontWeight: 600,
                        boxSizing: 'border-box'
                    }}
                >
                    {loading ? 'Processing...' : 'Explain Plan'}
                </button>
            </div>

            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {!explainResult ? (
                    <div style={{ textAlign: 'center', marginTop: '40px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔍</div>
                        <div style={{ fontSize: '14px' }}>Run a query to see the execution plan.</div>
                    </div>
                ) : (
                    <div style={{ fontSize: '13px', color: '#334155' }}>
                        <div style={{ fontWeight: 600, marginBottom: '10px' }}>Plan Summary</div>

                        {/* We can calculate total time here if explainResult is the list */}
                        {explainResult[0] && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Check Planning</div>
                                    <div style={{ fontWeight: 'bold' }}>{explainResult[0]['Planning Time'] ? explainResult[0]['Planning Time'] + 'ms' : 'N/A'}</div>
                                </div>
                                <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', color: '#047857' }}>Execution</div>
                                    <div style={{ fontWeight: 'bold', color: '#065f46' }}>{explainResult[0]['Execution Time'] ? explainResult[0]['Execution Time'] + 'ms' : 'N/A'}</div>
                                </div>
                            </div>
                        )}

                        <div style={{ color: '#64748b', lineHeight: 1.5 }}>
                            The plan is visualized on the right. Click on any node to see detailed cost analysis data.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
