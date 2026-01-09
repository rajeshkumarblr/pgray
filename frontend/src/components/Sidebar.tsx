import React from 'react';

interface SidebarProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    onRunExplain: () => void;
    loading: boolean;
    explainResult: any;
}

const Sidebar: React.FC<SidebarProps> = ({
    connectionInfo,
    sqlQuery,
    setSqlQuery,
    onRunExplain,
    loading,
    explainResult
}) => {
    
    // Recursive helper to render object tree (omitted as not used in this view)
    
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

                         <div style={{ color: '#64748b', lineHeight: 1.5 }}>
                            The plan is visualized on the right. Click on any node to see detailed cost analysis and operation specific information.
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
