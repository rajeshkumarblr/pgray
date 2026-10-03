import React from 'react';
import { Zap, AlertTriangle, Clock } from 'lucide-react';

interface PerformanceBadgeProps {
    durationMs: number;
    rowCount: number;
    onClick?: () => void;
}

const PerformanceBadge: React.FC<PerformanceBadgeProps> = ({ durationMs, rowCount, onClick }) => {
    let color = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
    let Icon = Zap;

    if (durationMs > 1000) {
        color = 'bg-red-500/10 text-red-400 border-red-500/25';
        Icon = Clock;
    } else if (durationMs > 200) {
        color = 'bg-amber-500/10 text-amber-400 border-amber-500/25';
        Icon = AlertTriangle;
    }

    const formattedMs = durationMs < 10 && durationMs > 0
        ? `${durationMs.toFixed(1)}ms`
        : `${durationMs.toFixed(0)}ms`;

    return (
        <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${color} text-[11px] font-mono transition-colors ${onClick ? 'cursor-pointer hover:opacity-85' : ''}`}
            title={onClick ? "Click for execution details" : "Query Execution Time"}
            onClick={onClick}
        >
            <Icon size={11} />
            <span className="font-semibold">{formattedMs}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">{rowCount} {rowCount === 1 ? 'row' : 'rows'}</span>
        </div>
    );
};

export default PerformanceBadge;

