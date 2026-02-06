import React from 'react';
import InsightsTab from './InsightsTab';
import ResultsTable from '../ResultsTable';
import NodeDetailsPanel from '../NodeDetailsPanel';
import QueryParametersPanel from './QueryParametersPanel';
import PerformanceBadge from '../PerformanceBadge';

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

    // Query Param Props
    sqlQuery: string;
    paramValues: { [key: string]: string };
    onParamChange: (values: { [key: string]: string }) => void;
    connectionInfo: any;
    metaParams?: any[];
    onExecuteQuery: () => void;
}

const BottomPane: React.FC<BottomPaneProps> = ({
    activeTab, setActiveTab,
    executionResult, execError,
    selectedNode, fullPlan, onCloseDetails,
    insights, onRunInsight, insightResults,
    height, isExpanded, onToggleExpand,
    sqlQuery, paramValues, onParamChange, connectionInfo, metaParams, onExecuteQuery
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
