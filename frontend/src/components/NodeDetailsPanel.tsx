import React from 'react';

interface NodeDetailsPanelProps {
    selectedNode: any; // Node from ReactFlow
    onClose: () => void;
}

const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({
    selectedNode,
    onClose
}) => {
    // Recursive helper to render object tree
    const renderObjectTree = (obj: any, depth = 0) => {
        // Handle non-object values immediately
        if (typeof obj !== 'object' || obj === null) {
             return null;
        }

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

    if (!selectedNode) return null;

    const { label, cost, rows, actual_rows, actual_time, details } = selectedNode.data;
    const rowsRemoved = details?.['Rows Removed by Filter'];

    return (
        <div style={{
            width: '380px',
            backgroundColor: '#fff',
            borderLeft: '1px solid #e2e8f0', // Left border for right sidebar
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            flexShrink: 0,
            boxShadow: '-2px 0 5px rgba(0,0,0,0.02)', // Shadow on left
            zIndex: 5
        }}>
            {/* Fixed Header for Node Details */}
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
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
                         <div>{actual_time !== undefined ? `${actual_time.toFixed(3)}ms` : `Cost: ${cost}`}</div>
                         <div>{actual_rows ?? rows} rows</div>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8', padding: '0 5px' }}
                >
                    &times;
                </button>
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
        </div>
    );
};

export default NodeDetailsPanel;
