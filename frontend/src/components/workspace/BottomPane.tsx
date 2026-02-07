import React from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import InsightsTab from './InsightsTab';
import ResultsTable from '../ResultsTable';
import NodeDetailsPanel from '../NodeDetailsPanel';
import QueryParametersPanel from './QueryParametersPanel';
import PerformanceBadge from '../PerformanceBadge';
import { Maximize2, Minimize2 } from 'lucide-react';

interface BottomPaneProps {
    activeTab: 'results' | 'details' | 'insights' | 'visualplan';
    setActiveTab: (tab: 'results' | 'details' | 'insights' | 'visualplan') => void;

    // Results Props
    executionResult: any;
    execError?: string | null;

    // Details Props
    selectedNode: any;
    fullPlan: any;
    onCloseDetails: () => void;

    // Insights Props
    insights: any[];
    onRunInsight: (id: string, sql: string) => void;
    insightResults: any;

    height: number;
    isExpanded: boolean;
    onToggleExpand: () => void;

    // Maximize Props
    isMaximized: boolean;
    onToggleMaximize: () => void;

    // Query Param Props
    sqlQuery: string;
    paramValues: { [key: string]: string };
    onParamChange: (values: { [key: string]: string }) => void;
    connectionInfo: any;
    metaParams?: any[];
    onExecuteQuery: () => void;

    // Visual Plan Props
    nodes?: Node[];
    edges?: Edge[];
    onNodesChange?: any;
    onNodeClick?: any;
    onPaneClick?: any;
    nodeTypes?: any;
    explainLoading?: boolean;
    explainError?: string;
    onRefreshPlan?: () => void;
    onAnalyzeNode?: (node: any) => void;
}

const BottomPane: React.FC<BottomPaneProps> = ({
    activeTab, setActiveTab,
    executionResult, execError,
    selectedNode, fullPlan, onCloseDetails,
    insights, onRunInsight, insightResults,
    height, isExpanded, onToggleExpand,
    isMaximized, onToggleMaximize,
    sqlQuery, paramValues, onParamChange, connectionInfo, metaParams, onExecuteQuery,
    nodes = [], edges = [], onNodesChange, onNodeClick, onPaneClick, nodeTypes,
    explainLoading, explainError, onRefreshPlan, onAnalyzeNode
}) => {
    // Ref for Visual Plan context menu
    const flowWrapperRef = React.useRef<HTMLDivElement>(null);
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

    // Compute actual height based on maximize state
    const computedHeight = isMaximized ? '100%' : (isExpanded ? `${height}px` : '35px');

    const tabStyle = (tab: string) => ({
        padding: '0 12px', height: '34px',
        background: activeTab === tab ? '#0f172a' : 'transparent',
        color: activeTab === tab ? '#f1f5f9' : '#94a3b8',
        border: 'none', borderTop: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
        cursor: 'pointer', fontSize: '12px', fontWeight: 600
    });

    return (
        <div style={{
            height: computedHeight,
            backgroundColor: '#0f172a',
            borderTop: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            transition: isMaximized ? 'none' : 'height 0.2s',
            flexShrink: isMaximized ? 0 : 0,
            flex: isMaximized ? 1 : 'none'
        }}>
            {/* Header / Tabs */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 10px', background: '#1e293b', height: '35px', borderBottom: '1px solid #334155',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', gap: '1px' }}>
                    <button
                        onClick={() => { setActiveTab('results'); if (!isExpanded) onToggleExpand(); }}
                        style={tabStyle('results') as React.CSSProperties}
                    >
                        Results {executionResult ? `(${executionResult.rowCount})` : ''}
                    </button>
                    <button
                        onClick={() => { setActiveTab('visualplan'); if (!isExpanded) onToggleExpand(); }}
                        style={tabStyle('visualplan') as React.CSSProperties}
                    >
                        Visual Plan
                    </button>
                    <button
                        onClick={() => { setActiveTab('details'); if (!isExpanded) onToggleExpand(); }}
                        style={tabStyle('details') as React.CSSProperties}
                    >
                        Node Details
                    </button>
                    <button
                        onClick={() => { setActiveTab('insights'); if (!isExpanded) onToggleExpand(); }}
                        style={tabStyle('insights') as React.CSSProperties}
                    >
                        Insights {insights && insights.length > 0 ? `(${insights.length})` : ''}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {executionResult && executionResult.executionTime !== undefined && (
                        <PerformanceBadge durationMs={executionResult.executionTime} rowCount={executionResult.rowCount || 0} />
                    )}
                    {activeTab === 'results' && executionResult && (
                        <button
                            onClick={() => {
                                if (!executionResult || !executionResult.rows || !executionResult.columns) return;
                                const headers = executionResult.columns.join(',');
                                const rows = executionResult.rows.map((row: any[]) =>
                                    row.map(cell => {
                                        if (cell === null) return '';
                                        const str = String(cell);
                                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                            return `"${str.replace(/"/g, '""')}"`;
                                        }
                                        return str;
                                    }).join(',')
                                ).join('\n');

                                const csvContent = headers + '\n' + rows;
                                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.setAttribute("href", url);
                                link.setAttribute("download", `query_results_${new Date().getTime()}.csv`);
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            style={{
                                background: '#334155', color: '#e2e8f0', border: '1px solid #475569',
                                borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <span>⬇</span> CSV
                        </button>
                    )}

                    {/* Maximize/Minimize Toggle */}
                    <button
                        onClick={onToggleMaximize}
                        style={{
                            background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', padding: '4px'
                        }}
                        title={isMaximized ? 'Restore' : 'Maximize'}
                    >
                        {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>

                    {/* Expand/Collapse Toggle */}
                    <button
                        onClick={onToggleExpand}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                        {isExpanded ? '▼' : '▲'}
                    </button>
                </div>
            </div>

            {/* Content */}
            {(isExpanded || isMaximized) && (
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    {activeTab === 'results' && (
                        <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <QueryParametersPanel
                                sql={sqlQuery}
                                paramValues={paramValues}
                                onChange={onParamChange}
                                connectionInfo={connectionInfo}
                                metaParams={metaParams}
                                onExecute={onExecuteQuery}
                            />
                            <div style={{ flex: 1, overflow: 'auto' }}>
                                {execError ? (
                                    <div style={{ padding: '20px', color: '#ef4444', fontFamily: 'monospace' }}>
                                        ❌ Error: {execError}
                                    </div>
                                ) : executionResult ? (
                                    <ResultsTable data={executionResult} />
                                ) : (
                                    <div style={{ padding: '20px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                                        Execute a query to see results.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'visualplan' && (
                        <div ref={flowWrapperRef} style={{ height: '100%', width: '100%', position: 'relative' }} onClick={() => setMenu(null)}>
                            {/* Visual Plan Header */}
                            {fullPlan && fullPlan[0] && (
                                <div style={{
                                    position: 'absolute', top: '10px', right: '10px', zIndex: 10,
                                    display: 'flex', alignItems: 'center', gap: '15px', fontSize: '12px', color: '#94a3b8',
                                    background: '#0f172a', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155'
                                }}>
                                    {fullPlan[0]['Planning Time'] !== undefined && (
                                        <span>
                                            Planning: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{fullPlan[0]['Planning Time'].toFixed(2)}ms</span>
                                        </span>
                                    )}
                                    {(fullPlan[0]['Execution Time'] !== undefined || fullPlan[0]['Total Runtime'] !== undefined) && (
                                        <span>
                                            Execution: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                                                {(fullPlan[0]['Execution Time'] || fullPlan[0]['Total Runtime']).toFixed(2)}ms
                                            </span>
                                        </span>
                                    )}
                                    {onRefreshPlan && (
                                        <button
                                            onClick={onRefreshPlan}
                                            style={{
                                                background: '#1e293b', border: '1px solid #475569', color: '#4ade80',
                                                fontSize: '10px', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer'
                                            }}
                                        >
                                            ⚡ Refresh
                                        </button>
                                    )}
                                </div>
                            )}

                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodeTypes={nodeTypes}
                                onNodesChange={onNodesChange}
                                onNodeClick={onNodeClick}
                                onNodeContextMenu={onNodeContextMenu}
                                onPaneClick={onPaneClickWrapper}
                                fitView
                                style={{ background: '#334155', height: '100%' }}
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background color="#475569" gap={20} />
                                <Controls />
                            </ReactFlow>

                            {/* Context Menu */}
                            {menu && (
                                <div
                                    style={{
                                        position: 'absolute', top: menu.y, left: menu.x, zIndex: 100,
                                        background: '#1e293b', border: '1px solid #475569', borderRadius: '4px',
                                        padding: '4px 0', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', minWidth: '150px'
                                    }}
                                >
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onAnalyzeNode) onAnalyzeNode(menu.node);
                                            setMenu(null);
                                        }}
                                        style={{
                                            padding: '8px 12px', fontSize: '13px', color: '#e2e8f0', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '8px'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        ⚡ Analyze Node
                                    </div>
                                </div>
                            )}

                            {/* Loading Overlay */}
                            {explainLoading && (
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'rgba(15, 23, 42, 0.7)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20
                                }}>
                                    <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>Analyzing Plan...</div>
                                </div>
                            )}

                            {/* Empty State */}
                            {!explainLoading && nodes.length === 0 && !explainError && (
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none'
                                }}>
                                    <div style={{
                                        background: '#1e293b', border: '1px solid #334155', padding: '20px', borderRadius: '8px',
                                        textAlign: 'center', color: '#94a3b8'
                                    }}>
                                        <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
                                        <div>Run EXPLAIN ANALYZE to see the visual plan.</div>
                                    </div>
                                </div>
                            )}

                            {/* Error Overlay */}
                            {explainError && (
                                <div style={{
                                    position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
                                    background: '#fee2e2', color: '#b91c1c', padding: '10px 20px', borderRadius: '8px', zIndex: 30
                                }}>
                                    Error: {explainError}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'details' && (
                        <div style={{ height: '100%', overflow: 'hidden' }}>
                            <NodeDetailsPanel
                                selectedNode={selectedNode}
                                onClose={onCloseDetails}
                                fullPlan={fullPlan}
                            />
                        </div>
                    )}

                    {activeTab === 'insights' && (
                        <InsightsTab
                            insights={insights}
                            onRunInsight={onRunInsight}
                            insightResults={insightResults}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default BottomPane;
