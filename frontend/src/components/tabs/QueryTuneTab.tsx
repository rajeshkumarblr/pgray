import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { format } from 'sql-formatter';
import 'reactflow/dist/style.css';
import ResultsTable from '../ResultsTable';
import NodeDetailsPanel from '../NodeDetailsPanel';

// Define the interface for Props passed from App.tsx
// This allows us to lift state up but keep logic here or passing it down
interface QueryTuneTabProps {
    activeTab: 'plan' | 'results';
    setActiveTab: (tab: 'plan' | 'results') => void;
    nodes: Node[];
    edges: Edge[];
    onNodesChange: any;
    onNodeClick: any;
    onPaneClick: any;
    selectedNode: Node | null;
    setSelectedNode: (node: Node | null) => void;
    explainResult: any;
    executionResult: any;
    loading: boolean;
    error: string;
    sqlQuery: string;
    flowWrapperRef: React.RefObject<HTMLDivElement>;
    reactFlowInstance: any;
    setReactFlowInstance: (instance: any) => void;
    onVisualizeJson: (json: string) => void;
    nodeTypes: any;
}

const QueryTuneTab: React.FC<QueryTuneTabProps> = ({
    activeTab, setActiveTab,
    nodes, edges, onNodesChange, onNodeClick, onPaneClick,
    selectedNode, setSelectedNode,
    explainResult, executionResult,
    error,
    sqlQuery,
    flowWrapperRef,
    setReactFlowInstance,
    nodeTypes
}) => {

    // Highlight logic (could be moved here or kept in App)
    // For now we assume highlightedText logic is inside SqlOverlay or computed in App
    // We'll re-implement getSqlHighlightParams if needed or pass it down.
    // Let's pass it down? Or compute it here.
    // Computing it here is better to keep App clean.

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

    // Format SQL for display
    const formattedSql = useMemo(() => {
        if (!sqlQuery) return '';
        try {
            return format(sqlQuery, { language: 'postgresql' });
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
                    flexDirection: 'column'
                }}>
                    <span>CURRENT QUERY</span>
                    {highlightText && (
                        <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px' }}>
                            Highlighting: <span style={{ color: '#38bdf8' }}>"{highlightText}"</span>
                        </span>
                    )}
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
                            lineHeight: '1.5'
                        }}
                        wrapLines={true}
                        showLineNumbers={true}
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

            {/* Center: Visualization */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#334155' }}>
                {/* Tabs for Plan vs Results */}
                <div style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #475569' }}>
                    <div onClick={() => setActiveTab('plan')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'plan' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'plan' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'plan' ? 600 : 500, fontSize: '13px' }}>Explain Plan</div>
                    <div onClick={() => setActiveTab('results')} style={{ padding: '8px 20px', cursor: 'pointer', color: activeTab === 'results' ? '#e2e8f0' : '#64748b', borderBottom: activeTab === 'results' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'results' ? 600 : 500, fontSize: '13px' }}>Query Results</div>
                </div>

                {/* Content */}
                {activeTab === 'plan' ? (
                    <div ref={flowWrapperRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={nodeTypes}
                            onNodesChange={onNodesChange}
                            onNodeClick={onNodeClick}
                            onPaneClick={onPaneClick}
                            fitView
                            onInit={setReactFlowInstance}
                            style={{ background: '#334155' }}
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background color="#475569" gap={20} />
                            <Controls />
                        </ReactFlow>
                    </div>
                ) : (
                    <div style={{ flex: 1, overflow: 'hidden', background: '#1e293b' }}>
                        {executionResult ? <ResultsTable data={executionResult} /> : <div style={{ padding: 20, color: '#94a3b8' }}>No execution results. Run the query first.</div>}
                    </div>
                )}

                {error && (
                    <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#fee2e2', color: '#b91c1c', padding: '10px 20px', borderRadius: '8px', zIndex: 10 }}>
                        Error: {error}
                    </div>
                )}
            </div>

            {/* Right: Details Panel */}
            <NodeDetailsPanel
                selectedNode={selectedNode}
                onClose={() => setSelectedNode(null)}
                fullPlan={explainResult}
            />
        </div>
    );
};

export default QueryTuneTab;
