import React from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { X, FlaskConical, Scale, RotateCw, Sparkles, Check } from 'lucide-react';

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
    const flowWrapperRef = React.useRef<HTMLDivElement>(null);
    const localFlowRef = React.useRef<any>(null);

    const [menu, setMenu] = React.useState<{ x: number, y: number, node: any } | null>(null);
    const [showSimBar, setShowSimBar] = React.useState(false);
    const [indexInput, setIndexInput] = React.useState('');

    React.useEffect(() => {
        if (simulationResult?.index_sql) {
            setIndexInput(simulationResult.index_sql);
        }
    }, [simulationResult]);

    // Re-fit view with maxZoom cap whenever nodes change so 2-3 node plans never scale to 200%
    React.useEffect(() => {
        if (localFlowRef.current && nodes.length > 0 && activeTab === 'visual') {
            const t = setTimeout(() => {
                try {
                    localFlowRef.current?.fitView({ padding: 0.25, maxZoom: 0.95, duration: 180 });
                } catch {}
            }, 40);
            return () => clearTimeout(t);
        }
    }, [nodes, activeTab]);

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
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden select-none" onClick={() => setMenu(null)}>
            {/* Header / Tabs */}
            <div className="flex h-10 bg-slate-950/90 border-b border-slate-800 items-center px-2.5 gap-1 overflow-x-auto no-scrollbar">
                <button
                    onClick={() => setActiveTab('visual')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        activeTab === 'visual'
                            ? 'bg-slate-800 text-slate-100 font-semibold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                >
                    Visual Plan
                </button>
                <button
                    onClick={() => setActiveTab('text')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        activeTab === 'text'
                            ? 'bg-slate-800 text-slate-100 font-semibold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                >
                    Raw Text
                </button>

                {/* Metrics & Actions Display */}
                <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400 flex-shrink-0">
                    {explainResult && explainResult[0] && (
                        <div className="flex items-center gap-2 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800 whitespace-nowrap font-mono text-[11px]">
                            {explainResult[0]['Planning Time'] !== undefined && (
                                <span>
                                    Plan <span className="text-slate-200 font-semibold">{explainResult[0]['Planning Time'].toFixed(2)}ms</span>
                                </span>
                            )}
                            {(explainResult[0]['Execution Time'] !== undefined || explainResult[0]['Total Runtime'] !== undefined) && (
                                <span>
                                    Exec <span className="text-emerald-400 font-semibold">
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
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0 border ${
                                showSimBar || simulationResult
                                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-purple-300'
                            }`}
                        >
                            <FlaskConical size={12} className="text-purple-400" />
                            <span>What-If Index</span>
                        </button>
                    )}
                    {baselineMetrics && (
                        <button
                            onClick={onCompare}
                            title="Compare current Plan/Exec time with baseline (first run)"
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-blue-300 text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0"
                        >
                            <Scale size={12} className="text-blue-400" />
                            <span>Compare</span>
                        </button>
                    )}
                    <button
                        onClick={onRefreshPlan}
                        title="Re-run EXPLAIN (ANALYZE, BUFFERS)"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0"
                    >
                        <RotateCw size={12} className={loading ? 'animate-spin text-blue-400' : 'text-emerald-400'} />
                        <span>Refresh</span>
                    </button>

                    {onClose && (
                        <button
                            onClick={onClose}
                            title="Close Plan View"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors flex-shrink-0"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Collapsible What-If Index Simulator Input Bar */}
            {showSimBar && onSimulateIndex && (
                <div className="px-3 py-2 bg-slate-900/95 border-b border-slate-800 flex items-center gap-2">
                    <span className="text-[11px] text-purple-300 font-semibold whitespace-nowrap flex items-center gap-1">
                        <FlaskConical size={12} /> Hypothetical DDL:
                    </span>
                    <input
                        type="text"
                        value={indexInput}
                        onChange={e => setIndexInput(e.target.value)}
                        placeholder="CREATE INDEX idx_orders_customer_id ON orders (customer_id);"
                        className="flex-1 bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-md px-2.5 py-1 text-slate-200 text-xs font-mono outline-none"
                    />
                    <button
                        disabled={simulatingIndex || !indexInput.trim()}
                        onClick={() => onSimulateIndex(indexInput.trim())}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1 rounded-md transition-colors whitespace-nowrap"
                    >
                        {simulatingIndex ? 'Simulating...' : 'Simulate'}
                    </button>
                </div>
            )}

            {/* Active Simulation Comparison Banner */}
            {simulationResult && (
                <div className="px-3 py-2 bg-purple-950/30 border-b border-purple-500/30 flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-purple-300 font-semibold flex items-center gap-1">
                            <FlaskConical size={13} /> Simulated Impact:
                        </span>
                        <span className="text-slate-300 font-mono text-[11px]">
                            Cost: <strong>{simulationResult.baseline_cost}</strong> → <strong className="text-emerald-400">{simulationResult.simulated_cost}</strong>{' '}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                simulationResult.cost_reduction_pct > 0
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400'
                            }`}>
                                {simulationResult.cost_reduction_pct > 0 ? `-${simulationResult.cost_reduction_pct}%` : '0%'}
                            </span>
                        </span>
                        <span className="text-slate-300 font-mono text-[11px]">
                            Exec: <strong>{simulationResult.baseline_exec_ms}ms</strong> → <strong className="text-sky-400">{simulationResult.simulated_exec_ms}ms</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {onApplyIndex && simulationResult.index_sql && (
                            <button
                                onClick={() => onApplyIndex(simulationResult.index_sql)}
                                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors"
                                title="Create this index permanently in PostgreSQL"
                            >
                                <Check size={12} /> Apply Index
                            </button>
                        )}
                        {onClearSimulation && (
                            <button
                                onClick={onClearSimulation}
                                className="border border-slate-700 hover:bg-slate-800 text-slate-300 text-[11px] px-2 py-1 rounded-md transition-colors"
                            >
                                Revert
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 relative overflow-hidden">
                {activeTab === 'visual' ? (
                    <>
                        <div ref={flowWrapperRef} className="h-full w-full">
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodeTypes={nodeTypes}
                                onNodesChange={onNodesChange}
                                onNodeClick={onNodeClick}
                                onNodeContextMenu={onNodeContextMenu}
                                onPaneClick={onPaneClickWrapper}
                                onInit={(instance) => {
                                    localFlowRef.current = instance;
                                    setReactFlowInstance(instance);
                                    instance.fitView({ padding: 0.25, maxZoom: 0.95 });
                                }}
                                fitView
                                fitViewOptions={{ padding: 0.25, maxZoom: 0.95 }}
                                minZoom={0.2}
                                maxZoom={1.35}
                                style={{ background: '#090d16' }}
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background color="#1e293b" gap={22} size={1.5} />
                                <Controls showInteractive={false} />
                            </ReactFlow>

                            {/* Context Menu */}
                            {menu && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: menu.y,
                                        left: menu.x,
                                        zIndex: 100,
                                    }}
                                    className="bg-slate-900 border border-slate-700 rounded-lg py-1 shadow-xl min-w-[160px]"
                                >
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onAnalyzeNode) onAnalyzeNode(menu.node);
                                            setMenu(null);
                                        }}
                                        className="px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer flex items-center gap-2"
                                    >
                                        <Sparkles size={13} className="text-purple-400" />
                                        <span>Analyze Node with AI</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Loading Overlay */}
                        {loading && (
                            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] flex items-center justify-center z-20">
                                <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg shadow-lg">
                                    <RotateCw size={14} className="animate-spin" />
                                    <span>Running EXPLAIN (ANALYZE, BUFFERS)...</span>
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {!loading && nodes.length === 0 && !error && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <div className="bg-slate-900/90 border border-slate-800 px-5 py-4 rounded-xl text-center text-slate-400 text-xs">
                                    Click <strong className="text-slate-200">Refresh</strong> to generate the execution plan graph.
                                </div>
                            </div>
                        )}

                        {/* Error Overlay */}
                        {error && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/40 text-red-200 px-4 py-2 rounded-lg text-xs z-30 shadow-lg max-w-[90%]">
                                {error}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 overflow-auto bg-slate-950 p-4 text-slate-200 h-full select-text">
                        {explainText ? (
                            <pre className="font-mono text-xs leading-relaxed text-slate-300">{explainText}</pre>
                        ) : (
                            <div className="text-slate-500 text-xs italic">No text plan available.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default QueryTuneTab;

