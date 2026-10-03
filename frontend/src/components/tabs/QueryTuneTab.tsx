import React from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { X } from 'lucide-react';

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
    onClose?: () => void;
    onSimulateIndex?: (indexSql: string) => Promise<void>;
    onApplyIndex?: (indexSql: string) => Promise<void>;
    simulationResult?: any | null;
    onClearSimulation?: () => void;
    simulatingIndex?: boolean;
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
    baselineMetrics,
    onClose,
    onSimulateIndex,
    onApplyIndex,
    simulationResult,
    onClearSimulation,
    simulatingIndex = false,
}) => {
    // Internal Ref for the flow wrapper
    const flowWrapperRef = React.useRef<HTMLDivElement>(null);

    // Context Menu State
    const [menu, setMenu] = React.useState<{ x: number, y: number, node: any } | null>(null);
    const [showSimBar, setShowSimBar] = React.useState(false);
    const [indexInput, setIndexInput] = React.useState('');

    React.useEffect(() => {
        if (simulationResult?.index_sql) {
            setIndexInput(simulationResult.index_sql);
        }
    }, [simulationResult]);

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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', overflow: 'hidden' }} onClick={() => setMenu(null)}>
            {/* Header / Tabs */}
            <div style={{ display: 'flex', height: '40px', background: '#0f172a', borderBottom: '1px solid #334155', alignItems: 'center', padding: '0 8px', gap: '4px', overflowX: 'auto' }}>

                <div
                    onClick={() => setActiveTab('visual')}
                    style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        color: activeTab === 'visual' ? '#e2e8f0' : '#64748b',
                        borderBottom: activeTab === 'visual' ? '2px solid #3b82f6' : '2px solid transparent',
                        fontWeight: activeTab === 'visual' ? 600 : 500,
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                    }}
                >
                    Visual Plan
                </div>
                <div
                    onClick={() => setActiveTab('text')}
                    style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        color: activeTab === 'text' ? '#e2e8f0' : '#64748b',
                        borderBottom: activeTab === 'text' ? '2px solid #3b82f6' : '2px solid transparent',
                        fontWeight: activeTab === 'text' ? 600 : 500,
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                    }}
                >
                    Text Plan
                </div>

                {/* Metrics & Actions Display */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                    {explainResult && explainResult[0] && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', padding: '3px 8px', borderRadius: '6px', border: '1px solid #334155', whiteSpace: 'nowrap' }}>
                            {explainResult[0]['Planning Time'] !== undefined && (
                                <span>
                                    Plan: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{explainResult[0]['Planning Time'].toFixed(2)}ms</span>
                                </span>
                            )}
                            {(explainResult[0]['Execution Time'] !== undefined || explainResult[0]['Total Runtime'] !== undefined) && (
                                <span>
                                    Exec: <span style={{ color: '#4ade80', fontWeight: 600 }}>
                                        {(explainResult[0]['Execution Time'] || explainResult[0]['Total Runtime']).toFixed(2)}ms
                                    </span>
                                </span>
                            )}
                        </div>
                    )}
                    {onSimulateIndex && (
                        <button
                            onClick={() => setShowSimBar(prev => !prev)}
                            title="Test a virtual CREATE INDEX inside a rollback transaction (What-If Index Simulator)"
                            style={{
                                background: showSimBar || simulationResult ? 'rgba(139, 92, 246, 0.25)' : '#1e293b',
                                border: showSimBar || simulationResult ? '1px solid #8b5cf6' : '1px solid #475569',
                                color: '#c4b5fd',
                                fontSize: '11px',
                                padding: '3px 7px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                fontWeight: 500
                            }}
                        >
                            🧪 What-If Index
                        </button>
                    )}
                    {baselineMetrics && (
                        <button
                            onClick={onCompare}
                            title="Compare current Plan/Exec time with baseline (first run)"
                            style={{
                                background: '#1e293b',
                                border: '1px solid #475569',
                                color: '#93c5fd',
                                fontSize: '11px',
                                padding: '3px 7px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                flexShrink: 0
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
                            fontSize: '11px',
                            padding: '3px 7px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                        }}
                    >
                        ⚡ Refresh
                    </button>

                    {onClose && (
                        <button
                            onClick={onClose}
                            title="Close Plan View"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0
                            }}
                        >
                            <X size={15} />
                        </button>
                    )}
                </div>
            </div>

            {/* Collapsible What-If Index Simulator Input Bar */}
            {showSimBar && onSimulateIndex && (
                <div style={{ padding: '8px 10px', background: '#131c31', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 600, whiteSpace: 'nowrap' }}>🧪 What-If DDL:</span>
                    <input
                        type="text"
                        value={indexInput}
                        onChange={e => setIndexInput(e.target.value)}
                        placeholder="CREATE INDEX idx_orders_customer_id ON orders (customer_id);"
                        style={{
                            flex: 1,
                            background: '#0f172a',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            color: '#e2e8f0',
                            fontSize: '11px',
                            fontFamily: 'Menlo, Monaco, monospace',
                            outline: 'none'
                        }}
                    />
                    <button
                        disabled={simulatingIndex || !indexInput.trim()}
                        onClick={() => onSimulateIndex(indexInput.trim())}
                        style={{
                            background: '#7c3aed',
                            border: 'none',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '4px',
                            cursor: simulatingIndex || !indexInput.trim() ? 'default' : 'pointer',
                            opacity: simulatingIndex || !indexInput.trim() ? 0.6 : 1,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {simulatingIndex ? 'Simulating...' : 'Run Simulation'}
                    </button>
                </div>
            )}

            {/* Active Simulation Comparison Banner */}
            {simulationResult && (
                <div style={{
                    padding: '8px 12px',
                    background: 'linear-gradient(90deg, rgba(88, 28, 135, 0.35), rgba(15, 23, 42, 0.9))',
                    borderBottom: '1px solid rgba(139, 92, 246, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                    fontSize: '11px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#d8b4fe', fontWeight: 700 }}>
                            🧪 Simulated Index Impact:
                        </span>
                        <span style={{ color: '#cbd5e1', fontFamily: 'Menlo, monospace' }}>
                            Cost: <strong>{simulationResult.baseline_cost}</strong> → <strong style={{ color: '#4ade80' }}>{simulationResult.simulated_cost}</strong>{' '}
                            <span style={{
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: simulationResult.cost_reduction_pct > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                                color: simulationResult.cost_reduction_pct > 0 ? '#6ee7b7' : '#94a3b8',
                                fontWeight: 700
                            }}>
                                {simulationResult.cost_reduction_pct > 0 ? `-${simulationResult.cost_reduction_pct}%` : '0%'}
                            </span>
                        </span>
                        <span style={{ color: '#cbd5e1', fontFamily: 'Menlo, monospace' }}>
                            Exec: <strong>{simulationResult.baseline_exec_ms}ms</strong> → <strong style={{ color: '#38bdf8' }}>{simulationResult.simulated_exec_ms}ms</strong>
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {onApplyIndex && simulationResult.index_sql && (
                            <button
                                onClick={() => onApplyIndex(simulationResult.index_sql)}
                                style={{
                                    background: '#059669',
                                    border: '1px solid #34d399',
                                    color: '#fff',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                                title="Create this index permanently in PostgreSQL"
                            >
                                ✅ Apply Index to DB
                            </button>
                        )}
                        {onClearSimulation && (
                            <button
                                onClick={onClearSimulation}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid #475569',
                                    color: '#94a3b8',
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Revert to Baseline
                            </button>
                        )}
                    </div>
                </div>
            )}

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
                                style={{ background: '#0f172a' }}
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
