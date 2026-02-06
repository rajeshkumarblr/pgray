import React from 'react';

interface PerformanceBadgeProps {
    durationMs: number;
    rowCount: number;
}

const PerformanceBadge: React.FC<PerformanceBadgeProps> = ({ durationMs, rowCount }) => {
    let color = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    let icon = '⚡';
    let label = 'Fast';

    // Threshold Logic
    if (durationMs > 1000) {
        color = 'bg-red-500/20 text-red-400 border-red-500/30';
        icon = '🐢';
        label = 'Slow';
    } else if (durationMs > 200) {
        color = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        icon = '⚠️';
        label = 'Moderate';
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${color} text-xs font-medium transition-all cursor-help`} title="Query Execution Time">
            <span className="text-sm">{icon}</span>
            <span className="font-bold">{durationMs.toFixed(0)}ms</span>
            <span className="opacity-70 hidden sm:inline">| {label}</span>
            <span className="opacity-50 ml-1">({rowCount} rows)</span>
        </div>
    );
};

export default PerformanceBadge;
