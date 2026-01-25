import React from 'react';

interface NodeDetailsPanelProps {
    selectedNode: any; // Node from ReactFlow
    onClose: () => void;
}



const NodeDetailsPanel: React.FC<NodeDetailsPanelProps & { fullPlan: any }> = ({
    selectedNode
}) => {


    // Recursive helper to render object tree (Visual Mode)
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
                        <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>{key}</div>
                        {renderObjectTree(value, depth + 1)}
                    </div>
                );
            }

            return (
                <div key={key} style={{ marginLeft: depth * 10, marginBottom: '4px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>
                    <span style={{ color: '#94a3b8' }}>{key}</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 500, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{String(value)}</span>
                </div>
            );
        });
    };

    // Prepare content based on selection
    const headerTitle = selectedNode ? selectedNode.data.label : "Plan Insights";

    // Compact Header Logic
    const nodeCost = selectedNode ? (selectedNode.data.actual_time !== undefined ? `${selectedNode.data.actual_time.toFixed(3)}ms` : `Cost: ${selectedNode.data.cost}`) : '';
    const nodeRows = selectedNode ? `${selectedNode.data.actual_rows ?? selectedNode.data.rows} rows` : '';
    const nodeIdDisplay = selectedNode ? selectedNode.id.replace('node_', '') : null;

    return (
        <div style={{
            width: '100%',
            backgroundColor: '#1e293b',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            flexShrink: 0,
            zIndex: 5,
            color: '#e2e8f0'
        }}>
            {/* Fixed Compact Header */}
            <div style={{ borderBottom: '1px solid #334155', background: '#1e293b', padding: '10px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {nodeIdDisplay && (
                        <div style={{
                            background: '#0f172a', color: '#94a3b8', fontWeight: 'bold',
                            borderRadius: '4px', padding: '2px 6px', fontSize: '11px'
                        }}>
                            #{nodeIdDisplay}
                        </div>
                    )}
                    <h2 style={{ margin: 0, fontSize: '14px', color: '#f1f5f9', fontWeight: 600 }}>{headerTitle}</h2>

                    {selectedNode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>
                            <span>{nodeCost}</span>
                            <span style={{ color: '#475569' }}>•</span>
                            <span>{nodeRows}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Scrollable Content - Visual Only */}
            <div style={{ padding: '0', overflowY: 'auto', flex: 1 }}>
                {selectedNode ? (
                    <div style={{ padding: '15px' }}>
                        {selectedNode.data.details?.['Rows Removed by Filter'] > 0 && (
                            <div style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #334155' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 'bold', fontSize: '13px', marginBottom: '5px' }}>
                                    <span style={{ background: '#450a0a', padding: '1px 5px', borderRadius: '4px', border: '1px solid #7f1d1d', fontSize: '10px' }}>!</span>
                                    Rows Discarded: {selectedNode.data.details['Rows Removed by Filter'].toLocaleString()}
                                </div>
                                <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.4 }}>
                                    <strong>Filter:</strong> <code style={{ color: '#e2e8f0' }}>{selectedNode.data.details['Filter']}</code>
                                </div>
                            </div>
                        )}

                        <h3 style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '10px', marginTop: '5px' }}>Operation Detail</h3>
                        {renderObjectTree(selectedNode.data.details)}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', marginBottom: '10px', opacity: 0.5 }}>🔍</div>
                        <div style={{ fontSize: '13px' }}>Select a node to view details</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NodeDetailsPanel;
