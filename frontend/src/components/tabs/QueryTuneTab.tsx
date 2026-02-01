import React from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';

interface QueryTuneTabProps {
    activeTab: 'visual' | 'text' | 'compare';
    setActiveTab: (tab: 'visual' | 'text' | 'compare') => void;

    nodes: Node[];
    edges: Edge[];
    onNodesChange: any;
    onNodeClick: any;
    onPaneClick: any;
    selectedNode: Node | null;

    explainResult: any;
    explainText: string;

    loading: boolean;
    error: string;

    setReactFlowInstance: (instance: any) => void;
    nodeTypes: any;

    onRefreshPlan: () => void;
    onAnalyzeNode?: (node: any) => void;
    onCompare?: () => void;
    baselineMetrics?: { planning: number, execution: number } | null;
}

const QueryTuneTab: React.FC<QueryTuneTabProps> = ({
    activeTab, setActiveTab,
    nodes, edges, onNodesChange, onNodeClick, onPaneClick,
    explainResult, explainText,
    loading, error,
    setReactFlowInstance,
    nodeTypes,
    onRefreshPlan,
    onAnalyzeNode,
    onCompare,
    baselineMetrics
}) => {
    // Internal Ref for the flow wrapper
    const flowWrapperRef = React.useRef<HTMLDivElement>(null);

    // Context Menu State
    const [menu, setMenu] = React.useState<{ x: number, y: number, node: any } | null>(null);

    const onNodeContextMenu = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            const pane = flowWrapperRef.current?.getBoundingClientRect();
            if (!pane) return;
            setMenu({
                x: event.clientX - pane.left,
                y: event.clientY - pane.top,
                node: node,
            });
        },
        [flowWrapperRef]
    );

    const onPaneClickWrapper = React.useCallback((event: any) => {
        setMenu(null);
        if (onPaneClick) onPaneClick(event);
    }, [onPaneClick]);

    // Fallback for custom nodes dispatching global event
    React.useEffect(() => {
        const handlePgrayMenu = (e: CustomEvent) => {
            const pane = flowWrapperRef.current?.getBoundingClientRect();
            if (!pane) return;

            setMenu({
                x: e.detail.x - pane.left,
                y: e.detail.y - pane.top,
                node: e.detail.node,
            });
        };
        window.addEventListener('pgray-node-contextmenu', handlePgrayMenu as EventListener);
        return () => window.removeEventListener('pgray-node-contextmenu', handlePgrayMenu as EventListener);
    }, [flowWrapperRef]);


    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#334155', overflow: 'hidden' }} onClick={() => setMenu(null)}>
            {/* Header / Tabs */}
            <div style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #475569', alignItems: 'center' }}>

                <div onClick={() => setActiveTab('visual')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'visual' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'visual' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'visual' ? 600 : 500, fontSize: '13px' }}>Visual Plan</div>
                <div onClick={() => setActiveTab('text')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'text' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'text' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'text' ? 600 : 500, fontSize: '13px' }}>Text Plan</div>
                <div onClick={() => setActiveTab('compare')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'compare' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'compare' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'compare' ? 600 : 500, fontSize: '13px' }}>Compare</div>

                {/* Metrics Display */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px', paddingRight: '20px', fontSize: '12px', color: '#94a3b8' }}>
                    {explainResult && explainResult[0] && (
                        <>
                            {explainResult[0]['Planning Time'] !== undefined && (
                                <span>
                                    Planning: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{explainResult[0]['Planning Time'].toFixed(2)}ms</span>
                                </span>
                            )}
                            {(explainResult[0]['Execution Time'] !== undefined || explainResult[0]['Total Runtime'] !== undefined) && (
                                <span>
                                    Execution: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                                        {(explainResult[0]['Execution Time'] || explainResult[0]['Total Runtime']).toFixed(2)}ms
                                    </span>
                                </span>
                            )}
                        </>
                    )}
                    {baselineMetrics && (
                        <button
                            onClick={onCompare}
                            title="Compare current Plan/Exec time with baseline (first run)"
                            style={{
                                background: '#334155',
                                border: '1px solid #475569',
                                color: '#93c5fd',
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                marginLeft: '10px'
                            }}
                        >
                            ⚖ Compare
                        </button>
                    )}
                    <button
                        onClick={onRefreshPlan}
                        title="Run EXPLAIN ANALYZE on this query again"
                        style={{
                            background: '#1e293b',
                            border: '1px solid #475569',
                            color: '#4ade80',
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginLeft: '10px'
                        }}
                    >
                        ⚡ Refresh
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {activeTab === 'visual' ? (
                    <>
                        <div ref={flowWrapperRef} style={{ height: '100%', width: '100%' }}>
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodeTypes={nodeTypes}
                                onNodesChange={onNodesChange}
                                onNodeClick={onNodeClick}
                                onNodeContextMenu={onNodeContextMenu}
                                onPaneClick={onPaneClickWrapper}
                                onInit={(instance) => {
                                    setReactFlowInstance(instance);
                                    instance.fitView({ padding: 0.2 });
                                }}
                                fitView
                                style={{ background: '#334155' }}
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background color="#475569" gap={20} />
                                <Controls />
                            </ReactFlow>

                            {/* Context Menu */}
                            {menu && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: menu.y,
                                        left: menu.x,
                                        zIndex: 100,
                                        background: '#1e293b',
                                        border: '1px solid #475569',
                                        borderRadius: '4px',
                                        padding: '4px 0',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                        minWidth: '150px'
                                    }}
                                >
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onAnalyzeNode) onAnalyzeNode(menu.node);
                                            setMenu(null);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            fontSize: '13px',
                                            color: '#e2e8f0',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '8px'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        ⚡ Analyze Node
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Loading Overlay */}
                        {loading && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(15, 23, 42, 0.7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 20
                            }}>
                                <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>Analyzing Plan...</div>
                            </div>
                        )}

                        {/* Empty State */}
                        {!loading && nodes.length === 0 && !error && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 10, pointerEvents: 'none'
                            }}>
                                <div style={{
                                    background: '#1e293b', border: '1px solid #334155', padding: '20px', borderRadius: '8px',
                                    textAlign: 'center', color: '#94a3b8'
                                }}>
                                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
                                    <div>No plan visualization available.</div>
                                </div>
                            </div>
                        )}

                        {/* Error Overlay */}
                        {error && (
                            <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#fee2e2', color: '#b91c1c', padding: '10px 20px', borderRadius: '8px', zIndex: 30 }}>
                                Error: {error}
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ flex: 1, overflow: 'auto', background: '#1e293b', padding: '20px', color: '#e2e8f0', height: '100%' }}>
                        {explainText ? (
                            <pre style={{ fontFamily: 'monospace', fontSize: '12px' }}>{explainText}</pre>
                        ) : (
                            <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No text plan available.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default QueryTuneTab;
