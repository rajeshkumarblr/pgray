import React from 'react';
import InsightsTab from './InsightsTab';
import ResultsTable from '../ResultsTable';
import QueryParametersPanel from './QueryParametersPanel';
import PerformanceBadge from '../PerformanceBadge';
import { Maximize2, Minimize2, Download, ChevronDown, ChevronUp, Table2, Lightbulb } from 'lucide-react';

interface BottomPaneProps {
    activeTab: 'results' | 'insights';
    setActiveTab: (tab: 'results' | 'insights') => void;

    // Results Props
    executionResult: any;
    execError?: string | null;

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
}

const BottomPane: React.FC<BottomPaneProps> = ({
    activeTab, setActiveTab,
    executionResult, execError,
    insights, onRunInsight, insightResults,
    height, isExpanded, onToggleExpand,
    isMaximized, onToggleMaximize,
    sqlQuery, paramValues, onParamChange, connectionInfo, metaParams, onExecuteQuery
}) => {
    const computedHeight = isMaximized ? '100%' : (isExpanded ? `${height}px` : '34px');

    return (
        <div
            style={{
                height: computedHeight,
                transition: isMaximized ? 'none' : 'height 0.18s ease',
                flexShrink: 0,
                flex: isMaximized ? 1 : 'none'
            }}
            className="bg-slate-950 border-t border-slate-800 flex flex-col select-none"
        >
            {/* Header / Tabs */}
            <div className="flex items-center justify-between px-2.5 bg-slate-900/90 h-[34px] border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => { setActiveTab('results'); if (!isExpanded) onToggleExpand(); }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeTab === 'results'
                                ? 'bg-slate-800 text-slate-100 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                    >
                        <Table2 size={13} className={activeTab === 'results' ? 'text-blue-400' : 'text-slate-500'} />
                        <span>Results</span>
                        {executionResult && (
                            <span className="font-mono text-[10px] px-1.5 py-0 rounded bg-slate-950/70 text-slate-400">
                                {executionResult.rowCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => { setActiveTab('insights'); if (!isExpanded) onToggleExpand(); }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            activeTab === 'insights'
                                ? 'bg-slate-800 text-slate-100 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                    >
                        <Lightbulb size={13} className={activeTab === 'insights' ? 'text-amber-400' : 'text-slate-500'} />
                        <span>Insights</span>
                        {insights && insights.length > 0 && (
                            <span className="font-mono text-[10px] px-1.5 py-0 rounded bg-slate-950/70 text-slate-400">
                                {insights.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-2">
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
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                            title="Export results as CSV"
                        >
                            <Download size={11} />
                            <span>CSV</span>
                        </button>
                    )}

                    {/* Maximize/Minimize Toggle */}
                    <button
                        onClick={onToggleMaximize}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                        title={isMaximized ? 'Restore Pane Size' : 'Maximize Results Pane'}
                    >
                        {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    </button>

                    {/* Expand/Collapse Toggle */}
                    <button
                        onClick={onToggleExpand}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                        title={isExpanded ? 'Collapse Results Pane' : 'Expand Results Pane'}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            {(isExpanded || isMaximized) && (
                <div className="flex-1 overflow-hidden relative">
                    {activeTab === 'results' && (
                        <div className="h-full overflow-hidden flex flex-col">
                            <QueryParametersPanel
                                sql={sqlQuery}
                                paramValues={paramValues}
                                onChange={onParamChange}
                                connectionInfo={connectionInfo}
                                metaParams={metaParams}
                                onExecute={onExecuteQuery}
                            />
                            <div className="flex-1 overflow-auto">
                                {execError ? (
                                    <div className="p-4 text-red-300 font-mono text-xs bg-red-950/20 border-b border-red-900/40">
                                        Error: {execError}
                                    </div>
                                ) : executionResult ? (
                                    <ResultsTable data={executionResult} />
                                ) : (
                                    <div className="p-6 text-slate-500 text-xs text-center">
                                        Press <span className="font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">⌘↵</span> or click <strong className="text-slate-300">Run</strong> to execute the query.
                                    </div>
                                )}
                            </div>
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

