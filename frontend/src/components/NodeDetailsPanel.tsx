import React from 'react';

interface NodeDetailsPanelProps {
    selectedNode: any; // Node from ReactFlow
    onClose: () => void;
}

const JsonTree = ({ data, selectedNodeDetails }: { data: any, selectedNodeDetails: any }) => {
    const isMatch = data === selectedNodeDetails;
    const elementRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (isMatch && elementRef.current) {
            elementRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isMatch]);

    if (typeof data !== 'object' || data === null) {
        return <span style={{ color: '#059669' }}>{JSON.stringify(data)}</span>;
    }

    return (
        <div
            ref={isMatch ? elementRef : null}
            style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                backgroundColor: isMatch ? 'rgba(234, 179, 8, 0.2)' : 'transparent', // Yellow/20 highlight
                borderRadius: '4px',
                padding: isMatch ? '2px 4px' : '0'
            }}
        >
            {Array.isArray(data) ? '[' : '{'}
            <div style={{ paddingLeft: '15px' }}>
                {Object.entries(data).map(([key, value], index, arr) => (
                    <div key={key}>
                        <span style={{ color: '#2563eb' }}>"{key}"</span>: <JsonTree data={value} selectedNodeDetails={selectedNodeDetails} />
                        {index < arr.length - 1 ? ',' : ''}
                    </div>
                ))}
            </div>
            {Array.isArray(data) ? ']' : '}'}
        </div>
    );
};

const NodeDetailsPanel: React.FC<NodeDetailsPanelProps & { fullPlan: any }> = ({
    selectedNode,
    onClose,
    fullPlan
}) => {
    const [activeTab, setActiveTab] = React.useState<'visual' | 'json'>('visual');

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

    // Extract root plan for JSON view
    let rootPlan = fullPlan;
    if (Array.isArray(fullPlan) && fullPlan.length > 0 && fullPlan[0].Plan) {
        rootPlan = fullPlan[0].Plan;
    } else if (fullPlan && fullPlan.Plan) {
        rootPlan = fullPlan.Plan;
    }

    return (
        <div style={{
            width: '450px', // Slightly wider for JSON
            backgroundColor: '#fff',
            borderLeft: '1px solid #e2e8f0', // Left border for right sidebar
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            flexShrink: 0,
            boxShadow: '-2px 0 5px rgba(0,0,0,0.02)', // Shadow on left
            zIndex: 5
        }}>
            {/* Fixed Header with Tabs */}
            <div style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                <div style={{ padding: '20px 20px 10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                        <div style={{ marginTop: '5px', color: '#64748b', fontSize: '13px' }}>
                            {actual_time !== undefined ? `${actual_time.toFixed(3)}ms` : `Cost: ${cost}`} • {actual_rows ?? rows} rows
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8', padding: '0 5px' }}
                    >
                        &times;
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', padding: '0 20px', gap: '20px' }}>
                    <div
                        onClick={() => setActiveTab('visual')}
                        style={{
                            padding: '10px 0',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === 'visual' ? 600 : 500,
                            color: activeTab === 'visual' ? '#0f172a' : '#64748b',
                            borderBottom: activeTab === 'visual' ? '2px solid #0f172a' : 'transparent',
                            marginBottom: '-1px'
                        }}
                    >
                        Visual
                    </div>
                    <div
                        onClick={() => setActiveTab('json')}
                        style={{
                            padding: '10px 0',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === 'json' ? 600 : 500,
                            color: activeTab === 'json' ? '#0f172a' : '#64748b',
                            borderBottom: activeTab === 'json' ? '2px solid #0f172a' : 'transparent',
                            marginBottom: '-1px'
                        }}
                    >
                        Raw JSON
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>

                {activeTab === 'visual' ? (
                    <>
                        {rowsRemoved > 0 && (
                            <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
                                    <span style={{ background: '#fecaca', padding: '2px 6px', borderRadius: '4px', border: '1px solid #f87171' }}>!</span>
                                    Rows Discarded: {rowsRemoved.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.5 }}>
                                    This node discards {rowsRemoved.toLocaleString()} rows produced by its subtree.
                                    <br /><br />
                                    <strong>Filter:</strong> <code>{details?.['Filter']}</code>
                                </div>
                            </div>
                        )}

                        <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '10px' }}>Operation Detail</h3>
                        {renderObjectTree(details)}
                    </>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        {rootPlan ? (
                            <JsonTree data={rootPlan} selectedNodeDetails={details} />
                        ) : (
                            <div style={{ color: '#64748b' }}>No plan data available</div>
                        )}
                    </div>
                )}

                <div style={{ height: '50px' }}></div>
            </div>
        </div>
    );
};

export default NodeDetailsPanel;
