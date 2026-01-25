import InsightsTab from './InsightsTab';
import ResultsTable from '../ResultsTable';
import NodeDetailsPanel from '../NodeDetailsPanel';

interface BottomPaneProps {
    activeTab: 'results' | 'details' | 'insights';
    setActiveTab: (tab: 'results' | 'details' | 'insights') => void;

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
}

const BottomPane: React.FC<BottomPaneProps> = ({
    activeTab, setActiveTab,
    executionResult, execError,
    selectedNode, fullPlan, onCloseDetails,
    insights, onRunInsight, insightResults,
    height, isExpanded, onToggleExpand
}) => {

    return (
        <div style={{
            height: isExpanded ? `${height}px` : '35px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            transition: 'height 0.2s',
            flexShrink: 0
        }}>
            {/* Header / Tabs */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 10px', background: '#1e293b', height: '35px', borderBottom: '1px solid #334155'
            }}>
                <div style={{ display: 'flex', gap: '1px' }}>
                    <button
                        onClick={() => { setActiveTab('results'); if (!isExpanded) onToggleExpand(); }}
                        style={{
                            padding: '0 12px', height: '34px',
                            background: activeTab === 'results' ? '#0f172a' : 'transparent',
                            color: activeTab === 'results' ? '#f1f5f9' : '#94a3b8',
                            border: 'none', borderTop: activeTab === 'results' ? '2px solid #3b82f6' : '2px solid transparent',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                    >
                        Results {executionResult ? `(${executionResult.rowCount})` : ''}
                    </button>
                    <button
                        onClick={() => { setActiveTab('details'); if (!isExpanded) onToggleExpand(); }}
                        style={{
                            padding: '0 12px', height: '34px',
                            background: activeTab === 'details' ? '#0f172a' : 'transparent',
                            color: activeTab === 'details' ? '#f1f5f9' : '#94a3b8',
                            border: 'none', borderTop: activeTab === 'details' ? '2px solid #3b82f6' : '2px solid transparent',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                    >
                        Node Details
                    </button>
                    <button
                        onClick={() => { setActiveTab('insights'); if (!isExpanded) onToggleExpand(); }}
                        style={{
                            padding: '0 12px', height: '34px',
                            background: activeTab === 'insights' ? '#0f172a' : 'transparent',
                            color: activeTab === 'insights' ? '#f1f5f9' : '#94a3b8',
                            border: 'none', borderTop: activeTab === 'insights' ? '2px solid #3b82f6' : '2px solid transparent',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                    >
                        Actionable Insights {insights && insights.length > 0 ? `(${insights.length})` : ''}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={onToggleExpand}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                        {isExpanded ? '▼' : '▲'}
                    </button>
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    {activeTab === 'results' && (
                        <div style={{ height: '100%', overflow: 'auto' }}>
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
