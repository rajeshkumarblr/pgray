import React from 'react';

interface SidebarProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    onRunExplain: () => void;
    loading: boolean;
    selectedNode: any; // Node from ReactFlow
    onClearSelection: () => void;
    explainResult: any;
}

const Sidebar: React.FC<SidebarProps> = ({
    connectionInfo,
    sqlQuery,
    setSqlQuery,
    onRunExplain,
    loading,
    selectedNode,
    onClearSelection,
    explainResult
}) => {
    
    // Recursive helper to render object tree
    const renderObjectTree = (obj: any, depth = 0) => {
        return Object.entries(obj).map(([key, value]) => {
            if (value === null || value === undefined) return null;
            
            // Skip large nested objects that are already handled visually or aren't relevant properties
            if (key === 'Plans' || key === 'Workers') return null;

            if (typeof value === 'object') {
                return (
                    <div key={key} style={{ marginLeft: depth * 10, marginTop: 5 }}>
                        <div style={{ fontWeight: 600, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>{key}</div>
                        {renderObjectTree(value, depth + 1)}
                    </div>
                );
            }
            
            return (
                <div key={key} style={{ marginLeft: depth * 10, marginBottom: '4px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '2px' }}>
                    <span style={{ color: '#64748b' }}>{key}</span>
                    <span style={{ color: '#0f172a', fontWeight: 500, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{String(value)}</span>
                </div>
            );
        });
    };

    const containerStyle: React.CSSProperties = {
        width: '380px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
        boxShadow: '2px 0 5px rgba(0,0,0,0.02)',
        zIndex: 5
    };

    // --- NODE DETAILS VIEW ---
    if (selectedNode) {
        const { label, cost, rows, actual_rows, actual_time, details } = selectedNode.data;
        const loops = details?.['Actual Loops'] || 1;
        const rowsRemoved = details?.['Rows Removed by Filter'];

        return (
            <div style={containerStyle}>
                {/* Fixed Header for Node Details */}
                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ 
                            background: '#0f172a', color: 'white', fontWeight: 'bold', 
                            borderRadius: '4px', padding: '4px 8px', fontSize: '12px'
                        }}>
                           #{selectedNode.id.replace('node_', '')}
                        </div>
                        <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{label}</h2>
                    </div>
                    
                    <div style={{ marginTop: '15px', color: '#64748b', fontSize: '13px' }}>
                         <div>{actual_time ? `${actual_time.toFixed(3)}ms` : `Cost: ${cost}`}</div>
                         <div>{actual_rows ?? rows} rows</div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    
                    {rowsRemoved > 0 && (
                        <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
                                <span style={{ background: '#fecaca', padding: '2px 6px', borderRadius: '4px', border: '1px solid #f87171' }}>!</span> 
                                Rows Discarded: {rowsRemoved.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.5 }}>
                                This node discards {rowsRemoved.toLocaleString()} rows produced by its subtree.
                                <br/><br/>
                                <strong>Filter:</strong> <code>{details?.['Filter']}</code>
                            </div>
                        </div>
                    )}

                    <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '10px' }}>Operation Detail</h3>
                    {renderObjectTree(details)}

                    <div style={{ height: '50px' }}></div>
                </div>

                <div style={{ padding: '15px', borderTop: '1px solid #e2e8f0' }}>
                     <button 
                        onClick={onClearSelection}
                        style={{ width: '100%', padding: '10px', background: 'white', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                     >
                        Back to top tips
                     </button>
                </div>
            </div>
        );
    }

    // --- QUERY / NEW PLAN VIEW ---
    return (
        <div style={containerStyle}>
             <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
               <h2 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#0f172a' }}>New Plan</h2>
               <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px' }}>
                   {connectionInfo ? `Connected to ${connectionInfo.host}:${connectionInfo.port}` : 'Not connected'}
               </div>
               
               <textarea
                   value={sqlQuery}
                   onChange={(e) => setSqlQuery(e.target.value)}
                   placeholder="Enter your SQL query here to generate an explain plan..."
                   style={{ 
                       width: '100%', height: '150px', padding: '12px', 
                       borderRadius: '6px', border: '1px solid #cbd5e1', 
                       fontFamily: 'monospace', fontSize: '13px', resize: 'vertical',
                       outline: 'none', background: '#f8fafc', color: '#334155',
                       boxSizing: 'border-box'
                   }}
               />
               <button 
                onClick={onRunExplain} 
                disabled={loading || !connectionInfo}
                style={{ 
                    marginTop: '15px', width: '100%', padding: '10px', 
                    background: '#2563eb', color: 'white', border: 'none', 
                    borderRadius: '6px', cursor: (loading || !connectionInfo) ? 'not-allowed' : 'pointer', 
                    opacity: (loading || !connectionInfo) ? 0.7 : 1, fontWeight: 600,
                    boxSizing: 'border-box'
                }}
               >
                 {loading ? 'Analyzing...' : 'Explain'}
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
                                     <div style={{ fontWeight: 'bold' }}>{explainResult[0]['Planning Time']}ms</div>
                                 </div>
                                 <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '6px' }}>
                                     <div style={{ fontSize: '11px', color: '#047857' }}>Execution</div>
                                     <div style={{ fontWeight: 'bold', color: '#065f46' }}>{explainResult[0]['Execution Time']}ms</div>
                                 </div>
                             </div>
                         )}

                         <div style={{  }}>
                            Select a node in the graph to see details.
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
