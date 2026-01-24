import React, { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { format } from 'sql-formatter';
import 'reactflow/dist/style.css';
import NodeDetailsPanel from '../NodeDetailsPanel';
import AIChatSidebar from '../AIChatSidebar';

// Define the interface for Props passed from App.tsx
interface QueryTuneTabProps {
    // Tab State
    activeTab: 'plan' | 'text'; // Changed from 'plan'|'results' to 'plan'|'text' (Visual vs Text)
    // Actually, App passes 'activeTab' and expects specific values?
    // App.tsx uses: const [tuneActiveSubTab, setTuneActiveSubTab] = useState<'plan' | 'results'>('plan');
    // I should ideally change App.tsx state type too, or map it.
    // 'results' is removed. New is 'text'.
    // I will rename the prop locally to avoid breaking App types immediately, or fix types.
    // Let's assume I fix types in App.tsx later or use 'results' as 'text' placeholder?
    // No, better to be clean. I'll update interface but I can't update App.tsx in single atomic write with this file.
    // I will accept 'plan' | 'text' and update App.tsx state in next step or assume generic string.
    setActiveTab: (tab: any) => void;

    nodes: Node[];
    edges: Edge[];
    onNodesChange: any;
    onNodeClick: any;
    onPaneClick: any;
    selectedNode: Node | null;
    setSelectedNode: (node: Node | null) => void;
    explainResult: any;
    explainText: string; // Added

    // executionResult prop is unused now as we removed Query Results tab
    executionResult?: any;

    loading: boolean;
    error: string;
    sqlQuery: string;
    flowWrapperRef: React.RefObject<HTMLDivElement>;
    reactFlowInstance: any;
    setReactFlowInstance: (instance: any) => void;
    onVisualizeJson: (json: string) => void;
    nodeTypes: any;
    onBack: () => void;


    // Chat Props for Embedded AI
    chatHistory: any[];
    onChatSend: (msg: string) => void;
    aiLoading: boolean;
    isVisible: boolean; // Added control prop
    onRunSql: (sql: string) => void;
    onRefreshPlan: () => void;
}

const QueryTuneTab: React.FC<QueryTuneTabProps> = ({
    activeTab, setActiveTab,
    nodes, edges, onNodesChange, onNodeClick, onPaneClick,
    selectedNode, setSelectedNode,
    explainResult, explainText,
    loading,
    error,
    sqlQuery,
    flowWrapperRef,
    reactFlowInstance, // Added missing prop
    setReactFlowInstance, // Added missing prop
    nodeTypes,
    onBack,
    chatHistory, onChatSend, aiLoading,
    isVisible, // Destructure isVisible
    onRunSql, onRefreshPlan
}) => {

    // Local state for right sidebar visibility? 
    // User said "use right side bar for AI".
    // I'll default it to open/docked.
    const [isAiOpen, setIsAiOpen] = useState(true);
    const hasAutofocusedRef = React.useRef(false);

    // Reset auto-focus flag when loading starts
    React.useEffect(() => {
        if (loading) {
            hasAutofocusedRef.current = false;
        }
    }, [loading]);

    // Auto-focus logic
    React.useEffect(() => {
        // Only run if visible
        if (isVisible && !loading && nodes.length > 0 && reactFlowInstance && !hasAutofocusedRef.current) {
            // Find max severity node
            let maxSeverity = -1;
            let targetNode: Node | null = null;

            nodes.forEach(node => {
                const s = node.data?.severity_score || 0;
                if (s > maxSeverity) {
                    maxSeverity = s;
                    targetNode = node;
                }
            });

            if (targetNode) {
                // Select the node
                setSelectedNode(targetNode);

                // Zoom to node
                // We use a slight delay to ensure React Flow has computed positions
                setTimeout(() => {
                    reactFlowInstance.fitView({
                        nodes: [targetNode],
                        padding: 0.5,
                        minZoom: 0.5,
                        maxZoom: 1.2,
                        duration: 800
                    });
                }, 100);
            }
            hasAutofocusedRef.current = true;
        }
    }, [loading, nodes, reactFlowInstance, setSelectedNode, isVisible]);

    const getSqlHighlightParams = (node: Node | null) => {
        if (!node || !node.data || !node.data.details) return undefined;
        const type = node.data.label.toLowerCase();
        const details = node.data.details;

        if (type.includes('scan')) {
            const condition = details['Index Cond'] || details['Filter'];
            if (condition) {
                const cleanCond = condition
                    .replace(/::[a-zA-Z0-9_]+/g, '')
                    .replace(/['"].*?['"]/g, '')
                    .replace(/[()=><!,]/g, ' ');
                const terms = cleanCond.split(/\s+/).filter((t: string) => {
                    const lower = t.toLowerCase();
                    return lower.length > 2 && !['and', 'or', 'not', 'null', 'is', 'in', 'any', 'all', 'between'].includes(lower);
                });
                if (terms.length > 0) {
                    const alias = details['Alias'] || details['Relation Name'];
                    if (alias) return `${alias} ${terms[0]}`;
                    return terms[0];
                }
            }
            if (details['Relation Name']) return details['Relation Name'];
            if (details['Alias']) return details['Alias'];
        }
        if (type.includes('sort')) return 'order by';
        if (type.includes('limit')) return 'LIMIT';
        if (type.includes('aggregate')) return 'group by';
        if (type.includes('join') || type.includes('loop')) return 'join';
        return undefined;
    };

    const highlightText = useMemo(() => getSqlHighlightParams(selectedNode), [selectedNode]);

    // Format SQL for display & Strip Comments
    const formattedSql = useMemo(() => {
        if (!sqlQuery) return '';
        try {
            // Strip comments first (simple regex for -- and /* */)
            const noComments = sqlQuery.replace(/--.*$|\/\*[\s\S]*?\*\//gm, '');
            // Format
            return format(noComments, { language: 'postgresql' });
        } catch (e) {
            return sqlQuery;
        }
    }, [sqlQuery]);

    const lines = useMemo(() => formattedSql.split('\n'), [formattedSql]);

    // Calculate matched lines
    const matchedLineNumbers = useMemo(() => {
        if (!highlightText) return [];
        const matches: number[] = [];
        const searchText = highlightText.toLowerCase();
        const searchTerms = searchText.split(' ').filter((t: string) => t.length > 0);

        lines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();
            let isMatch = lowerLine.includes(searchText);
            if (!isMatch && searchTerms.length > 0) {
                isMatch = searchTerms.every((term: string) => lowerLine.includes(term));
            }
            if (isMatch) matches.push(index + 1);
        });
        return matches;
    }, [lines, highlightText]);

    // Resizable AI Sidebar State
    const [aiChatHeight, setAiChatHeight] = useState(50); // Percentage
    const isResizingRef = React.useRef(false);

    const startAiResize = (e: React.MouseEvent) => {
        isResizingRef.current = true;
        e.preventDefault();
        document.addEventListener('mousemove', handleAiResize);
        document.addEventListener('mouseup', stopAiResize);
    };

    const handleAiResize = (_e: MouseEvent) => {
        if (!isResizingRef.current) return;
        // Calculate new percentage based on mouse position relative to right container
        // This is tricky because the container is the right column.
        // We can use the window height or container bounds.
        // Simplest: use window.innerHeight assuming full height app, but there's a header?
        // Let's rely on movementY for delta.
        // Or get sidebar rect.
        // Since we are adding event listener to document, we can estimate relative to window top?
        // Let's try movement first? No, absolute position is better.
        // We can get the offset of the container. 
        // But we don't have a ref to the container. Let's create one.
    };
    // Actually, simpler logic:
    // We can just use `movementY` to adjust the percentage approx, or better:
    // Update logic inside the render since I can't easily add ref references to existing divs without large replaces.
    // I will add the ref to the RIGHT SIDEBAR div in the replacement content.

    const rightSidebarRef = React.useRef<HTMLDivElement>(null);

    const onAiResize = (e: MouseEvent) => {
        if (rightSidebarRef.current) {
            const rect = rightSidebarRef.current.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const newHeight = (relativeY / rect.height) * 100;
            // Clamp
            if (newHeight > 20 && newHeight < 80) {
                setAiChatHeight(newHeight);
            }
        }
    };

    const stopAiResize = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', onAiResize);
        document.removeEventListener('mouseup', stopAiResize);
    };

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Left: Read-only SQL View */}
            <div style={{
                width: '350px',
                background: '#1e293b',
                borderRight: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0
            }}>
                <div style={{
                    padding: '10px 15px',
                    borderBottom: '1px solid #334155',
                    color: '#94a3b8',
                    fontWeight: 600,
                    fontSize: '12px',
                    background: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                            onClick={onBack}
                            style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: 0 }}
                        >
                            <span>← Back to Editor</span>
                        </button>
                    </div>

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>QUERY</span>
                            <button
                                onClick={onRefreshPlan}
                                title="Run EXPLAIN ANALYZE on this query again"
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#4ade80',
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                ⚡ Refresh Plan
                            </button>
                        </div>
                        {highlightText && (
                            <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px', display: 'block' }}>
                                Highlighting: <span style={{ color: '#38bdf8' }}>"{highlightText}"</span>
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <SyntaxHighlighter
                        language="sql"
                        style={vscDarkPlus}
                        customStyle={{
                            margin: 0,
                            padding: '15px',
                            background: 'transparent',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            minHeight: '100%',
                            boxSizing: 'border-box'
                        }}
                        wrapLines={true}
                        showLineNumbers={false}
                        lineProps={(lineNumber: number) => {
                            if (matchedLineNumbers.includes(lineNumber)) {
                                return {
                                    style: {
                                        display: 'block',
                                        backgroundColor: '#854d0e', // Dark yellow/orange
                                        color: '#fef08a',
                                        fontWeight: 'bold',
                                        borderLeft: '4px solid #facc15',
                                        paddingLeft: '11px',
                                        marginLeft: '-15px',
                                        width: 'calc(100% + 15px)'
                                    }
                                };
                            }
                            return { style: { display: 'block' } };
                        }}
                    >
                        {formattedSql}
                    </SyntaxHighlighter>
                </div>
            </div>

            {/* Center: Visualization and Details (Bottom Split) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#334155', minWidth: 0 }}>
                {/* Tabs */}
                <div style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #475569' }}>
                    <div onClick={() => setActiveTab('plan')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'plan' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'plan' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'plan' ? 600 : 500, fontSize: '13px' }}>Visual Plan</div>
                    <div onClick={() => setActiveTab('text')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'text' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'text' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'text' ? 600 : 500, fontSize: '13px' }}>Text Plan</div>

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
                    </div>
                </div>

                {/* Main Content Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {activeTab === 'plan' ? (
                        <>
                            {/* Visual Plan Graph */}
                            <div ref={flowWrapperRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    nodeTypes={nodeTypes}
                                    onNodesChange={onNodesChange}
                                    onNodeClick={onNodeClick}
                                    onPaneClick={onPaneClick}
                                    onInit={setReactFlowInstance}
                                    style={{ background: '#334155' }}
                                    proOptions={{ hideAttribution: true }}
                                >
                                    <Background color="#475569" gap={20} />
                                    <Controls />
                                </ReactFlow>

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

                                {/* Empty State Overlay */}
                                {!loading && nodes.length === 0 && (
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
                                            <div style={{ fontSize: '12px', marginTop: '5px', color: '#64748b' }}>Run "Tune" from the Editor to generate a plan.</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Error Overlay */}
                            {error && (
                                <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#fee2e2', color: '#b91c1c', padding: '10px 20px', borderRadius: '8px', zIndex: 30 }}>
                                    Error: {error}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ flex: 1, overflow: 'auto', background: '#1e293b', padding: '20px', color: '#e2e8f0' }}>
                            {explainText ? (
                                <pre style={{ fontFamily: 'monospace', fontSize: '12px' }}>{explainText}</pre>
                            ) : (
                                <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No text plan available. Run a query to generate one.</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Bottom Pane: Node Details - Moved to Right Sidebar, so just closing div for center? */}
                {/* Wait, the center column originally had NodeDetailsPanel. */}
                {/* In the previous edit, I moved NodeDetailsPanel to the Right Sidebar. */}
                {/* So the Center column should just end here without NodeDetailsPanel. */}
                {/* I see I already moved it in my 'ReplacementContent' of Steps 658/667. */}
                {/* SO, correct: Center column ends after 'Main Content Area' div close. */}

            </div> {/* Close Center Column */}

            {/* Right: AI Assistant & Plan Insights */}
            <div
                ref={rightSidebarRef}
                style={{
                    width: isAiOpen ? '420px' : '0px', // Widened for insights
                    borderLeft: isAiOpen ? '1px solid #334155' : 'none',
                    background: '#0f172a',
                    transition: 'width 0.2s',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                {/* Top: AI Chat */}
                <div style={{ height: `${aiChatHeight}%`, borderBottom: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AIChatSidebar
                        messages={chatHistory}
                        onClose={() => setIsAiOpen(false)}
                        onSend={onChatSend}
                        loading={aiLoading}
                        aiState={loading ? 'thinking' : 'idle'}
                        title="Query Tuning Discussion"
                        onRunSql={onRunSql}
                    />
                </div>

                {/* Resizer Handle */}
                <div
                    onMouseDown={startAiResize}
                    style={{
                        height: '6px',
                        background: '#1e293b',
                        cursor: 'row-resize',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderTop: '1px solid #334155',
                        borderBottom: '1px solid #334155',
                        flexShrink: 0
                    }}
                >
                    <div style={{ width: '30px', height: '2px', background: '#475569', borderRadius: '2px' }} />
                </div>

                {/* Bottom: Plan Insights */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1e293b' }}>
                    <NodeDetailsPanel
                        selectedNode={selectedNode}
                        onClose={() => setSelectedNode(null)}
                        fullPlan={explainResult}
                    />
                </div>
            </div>

            {/* ... */}
        </div>
    );
};

export default QueryTuneTab;
