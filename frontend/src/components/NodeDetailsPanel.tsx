import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Database, Clock, Layers } from 'lucide-react';

interface NodeDetailsPanelProps {
    selectedNode: any; // Node from ReactFlow
    onClose: () => void;
    fullPlan?: any;
    onAnalyzeNode?: (node: any) => void;
}

const HIGHLIGHT_KEYS = new Set([
    'Filter',
    'Index Cond',
    'Recheck Cond',
    'Hash Cond',
    'Merge Cond',
    'Join Filter',
    'Sort Key',
    'Group Key',
    'Output',
]);

const SUMMARY_HANDLED_KEYS = new Set([
    'Plans',
    'Workers',
    'Actual Startup Time',
    'Actual Total Time',
    'Actual Rows',
    'Plan Rows',
    'Startup Cost',
    'Total Cost',
    'Shared Hit Blocks',
    'Shared Read Blocks',
]);

const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({
    selectedNode,
    onAnalyzeNode,
}) => {
    const [showZeroFields, setShowZeroFields] = useState(false);

    if (!selectedNode) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-6 bg-slate-900/50">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                    <Layers size={18} />
                </div>
                <div className="text-sm font-medium text-slate-300 mb-1">No Plan Node Selected</div>
                <div className="text-xs text-slate-500 max-w-[220px]">
                    Click any node in the Visual Plan graph to inspect row skew, buffer I/O, and filter predicates.
                </div>
            </div>
        );
    }

    const details = selectedNode.data?.details || {};
    const headerTitle = selectedNode.data?.label || details['Node Type'] || 'Plan Node';
    const relationName = details['Relation Name'] || details['Index Name'] || null;
    const nodeIdDisplay = selectedNode.id ? selectedNode.id.replace('node_', '') : null;

    const actualTime = details['Actual Total Time'] ?? selectedNode.data?.actual_time;
    const startupTime = details['Actual Startup Time'];
    const totalCost = details['Total Cost'] ?? selectedNode.data?.cost;
    const startupCost = details['Startup Cost'] ?? 0;

    const actualRows = details['Actual Rows'] ?? selectedNode.data?.actual_rows;
    const planRows = details['Plan Rows'] ?? selectedNode.data?.rows;
    const rowsRemoved = details['Rows Removed by Filter'] || details['Rows Removed by Index Recheck'] || 0;

    // Calculate planner row estimate skew
    let skewRatio = 1;
    let skewDirection: 'accurate' | 'under' | 'over' = 'accurate';
    if (actualRows !== undefined && planRows !== undefined && planRows > 0) {
        if (actualRows >= planRows) {
            skewRatio = actualRows / planRows;
            if (skewRatio >= 2.5) skewDirection = 'under';
        } else if (actualRows > 0) {
            skewRatio = planRows / actualRows;
            if (skewRatio >= 2.5) skewDirection = 'over';
        }
    }

    // Buffer I/O (PostgreSQL blocks are 8KB each)
    const sharedHits = details['Shared Hit Blocks'] || 0;
    const sharedReads = details['Shared Read Blocks'] || 0;
    const totalBlocks = sharedHits + sharedReads;
    const cacheHitPct = totalBlocks > 0 ? Math.round((sharedHits / totalBlocks) * 100) : null;
    const totalKb = totalBlocks * 8;

    // Split remaining properties into active vs zero/false boilerplate
    const allEntries = Object.entries(details).filter(
        ([k, v]) => v !== null && v !== undefined && !SUMMARY_HANDLED_KEYS.has(k) && !HIGHLIGHT_KEYS.has(k)
    );
    const activeEntries = allEntries.filter(([_, v]) => v !== 0 && v !== false && v !== '');
    const zeroEntries = allEntries.filter(([_, v]) => v === 0 || v === false || v === '');

    const predicateEntries = Object.entries(details).filter(
        ([k, v]) => HIGHLIGHT_KEYS.has(k) && v !== null && v !== undefined
    );

    return (
        <div className="w-full h-full bg-slate-900 flex flex-col text-slate-200 overflow-hidden">
            {/* Compact Header */}
            <div className="border-b border-slate-800 bg-slate-950/60 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {nodeIdDisplay && (
                        <span className="bg-slate-800 text-slate-400 font-mono font-bold rounded px-1.5 py-0.5 text-[11px] border border-slate-700">
                            #{nodeIdDisplay}
                        </span>
                    )}
                    <div className="truncate">
                        <h2 className="m-0 text-sm text-slate-100 font-semibold truncate">{headerTitle}</h2>
                        {relationName && (
                            <div className="text-[11px] text-blue-400 font-mono truncate">on {relationName}</div>
                        )}
                    </div>
                </div>

                {onAnalyzeNode && (
                    <button
                        onClick={() => onAnalyzeNode(selectedNode)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-medium transition-colors flex-shrink-0"
                        title="Ask AI to analyze and optimize this plan node"
                    >
                        <Sparkles size={12} className="text-purple-400" />
                        <span>Optimize Node</span>
                    </button>
                )}
            </div>

            {/* Scrollable Diagnostic Body */}
            <div className="p-3.5 overflow-y-auto flex-1 space-y-3">
                {/* Key Metric Cards (2x2 Grid) */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                            <Clock size={11} className="text-blue-400" /> Execution Time
                        </div>
                        <div className="text-sm font-semibold text-slate-100 font-mono">
                            {actualTime !== undefined ? `${Number(actualTime).toFixed(3)} ms` : 'N/A'}
                        </div>
                        {startupTime !== undefined && (
                            <div className="text-[11px] text-slate-500">
                                Startup: {Number(startupTime).toFixed(3)} ms
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                            <Layers size={11} className="text-indigo-400" /> Planner Cost
                        </div>
                        <div className="text-sm font-semibold text-slate-100 font-mono">
                            {totalCost !== undefined ? Number(totalCost).toFixed(2) : 'N/A'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                            Startup: {Number(startupCost).toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* Row Cardinality & Planner Estimate Accuracy */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                            Cardinality (Est vs Actual)
                        </span>
                        {skewDirection === 'accurate' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={10} /> {skewRatio.toFixed(1)}x (Accurate)
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <AlertTriangle size={10} /> {skewRatio.toFixed(1)}x {skewDirection === 'under' ? 'Under-est' : 'Over-est'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                        <div>
                            <span className="text-slate-400">Estimated: </span>
                            <span className="text-slate-200 font-semibold">{planRows?.toLocaleString() ?? '—'}</span>
                        </div>
                        <div>
                            <span className="text-slate-400">Actual: </span>
                            <span className="text-slate-100 font-semibold">{actualRows?.toLocaleString() ?? '—'}</span>
                        </div>
                    </div>
                </div>

                {/* Buffer Cache & I/O Card */}
                {totalBlocks > 0 && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                                <Database size={11} className="text-teal-400" /> Shared Buffers I/O
                            </span>
                            {cacheHitPct !== null && (
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                    cacheHitPct >= 95 ? 'bg-teal-500/10 text-teal-300' : 'bg-amber-500/10 text-amber-300'
                                }`}>
                                    {cacheHitPct}% Cache Hit ({totalKb} KB)
                                </span>
                            )}
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                            <span>Hits: <strong>{sharedHits}</strong> blks</span>
                            <span>Disk Reads: <strong>{sharedReads}</strong> blks</span>
                        </div>
                    </div>
                )}

                {/* Filter Warning */}
                {rowsRemoved > 0 && (
                    <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-red-400 font-semibold text-xs mb-1">
                            <AlertTriangle size={13} />
                            <span>Rows Discarded by Filter: {rowsRemoved.toLocaleString()}</span>
                        </div>
                        {details['Filter'] && (
                            <div className="text-xs font-mono text-red-200 bg-slate-950/70 p-1.5 rounded border border-red-900/30 break-all">
                                {String(details['Filter'])}
                            </div>
                        )}
                    </div>
                )}

                {/* Predicates & Keys */}
                {predicateEntries.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            Predicates & Keys
                        </div>
                        {predicateEntries.map(([key, value]) => (
                            <div key={key} className="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
                                <div className="text-[10px] text-slate-400 font-medium mb-1">{key}</div>
                                <div className="text-xs font-mono text-blue-200 break-all">
                                    {Array.isArray(value) ? value.join(', ') : String(value)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Active Node Attributes */}
                <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                        Node Properties
                    </div>
                    {activeEntries.map(([key, value]) => (
                        <div
                            key={key}
                            className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-800/70 text-xs"
                        >
                            <span className="text-slate-400">{key}</span>
                            <span className="text-slate-200 font-mono text-right break-all max-w-[60%]">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Collapsible Zero/False Internal Properties */}
                {zeroEntries.length > 0 && (
                    <div className="pt-1">
                        <button
                            onClick={() => setShowZeroFields(!showZeroFields)}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            {showZeroFields ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <span>
                                {showZeroFields ? 'Hide' : 'Show'} {zeroEntries.length} zero/inactive planner fields
                            </span>
                        </button>
                        {showZeroFields && (
                            <div className="mt-2 pl-2 border-l border-slate-800 space-y-1">
                                {zeroEntries.map(([key, value]) => (
                                    <div
                                        key={key}
                                        className="flex justify-between items-center py-1 text-[11px] text-slate-500"
                                    >
                                        <span>{key}</span>
                                        <span className="font-mono">{String(value)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NodeDetailsPanel;

