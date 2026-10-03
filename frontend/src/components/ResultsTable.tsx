import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2 } from 'lucide-react';

interface ResultsTableProps {
    data: {
        columns: string[];
        rows: any[][];
        rowCount: number;
        isLimited?: boolean;
        message?: string;
    } | null;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ data }) => {
    const [sortCol, setSortCol] = useState<number | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    if (!data) return null;

    if (data.message && data.columns.length === 0) {
        return (
            <div className="p-6 text-slate-300 flex items-center justify-center gap-2 text-xs font-mono">
                <CheckCircle2 size={15} className="text-emerald-400" />
                <span>{data.message}</span>
                <span className="text-slate-500">({data.rowCount} rows affected)</span>
            </div>
        );
    }

    // Determine column types based on first 25 rows
    const colTypes = useMemo(() => {
        if (!data.rows || data.rows.length === 0) return data.columns.map(() => 'string');
        return data.columns.map((_, i) => {
            let isNum = true;
            let distinctValues = 0;
            for (let r = 0; r < Math.min(data.rows.length, 25); r++) {
                const val = data.rows[r][i];
                if (val !== null && val !== undefined && val !== '') {
                    distinctValues++;
                    const num = Number(val);
                    if (isNaN(num) || typeof val === 'object') {
                        if (typeof val === 'string' && !/^-?\d+(\.\d+)?$/.test(val.trim())) {
                            isNum = false;
                            break;
                        }
                    }
                }
            }
            return (distinctValues > 0 && isNum) ? 'number' : 'string';
        });
    }, [data.rows, data.columns]);

    const sortedRows = useMemo(() => {
        if (!data.rows) return [];
        if (sortCol === null) return data.rows;
        const isNum = colTypes[sortCol] === 'number';
        return [...data.rows].sort((a, b) => {
            const va = a[sortCol];
            const vb = b[sortCol];
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            const cmp = isNum ? Number(va) - Number(vb) : String(va).localeCompare(String(vb));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [data.rows, sortCol, sortDir, colTypes]);

    const handleHeaderClick = (idx: number) => {
        if (sortCol === idx) {
            if (sortDir === 'asc') setSortDir('desc');
            else setSortCol(null);
        } else {
            setSortCol(idx);
            setSortDir('asc');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 select-text">
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full border-collapse text-xs text-slate-200">
                    <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10 border-b border-slate-800 select-none">
                        <tr>
                            {/* Row Number Gutter Header */}
                            <th className="w-10 py-1.5 px-2 border-b border-r border-slate-800 text-right font-mono text-[10px] font-medium text-slate-500 bg-slate-950/80">
                                #
                            </th>
                            {data.columns.map((col, idx) => {
                                const isNum = colTypes[idx] === 'number';
                                const isSorted = sortCol === idx;
                                return (
                                    <th
                                        key={idx}
                                        onClick={() => handleHeaderClick(idx)}
                                        className="py-1.5 px-3 border-b border-r border-slate-800 whitespace-nowrap font-medium text-slate-300 hover:bg-slate-800/70 cursor-pointer transition-colors group"
                                    >
                                        <div className={`flex items-center gap-1.5 ${isNum ? 'justify-end' : 'justify-between'}`}>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-xs text-slate-200">{col}</span>
                                                <span className="text-[9px] font-mono px-1 py-0 rounded bg-slate-800/90 text-slate-500">
                                                    {isNum ? 'num' : 'txt'}
                                                </span>
                                            </div>
                                            <span className="text-slate-500 opacity-60 group-hover:opacity-100">
                                                {isSorted ? (
                                                    sortDir === 'asc' ? <ArrowUp size={11} className="text-blue-400" /> : <ArrowDown size={11} className="text-blue-400" />
                                                ) : (
                                                    <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-60" />
                                                )}
                                            </span>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {sortedRows.map((row, rowIdx) => (
                            <tr
                                key={(row as any)._id || rowIdx}
                                className="even:bg-slate-900/30 hover:bg-blue-500/10 transition-colors"
                            >
                                {/* Row Number Gutter Cell */}
                                <td className="py-1.5 px-2 border-r border-slate-800/80 text-right font-mono text-[10px] text-slate-600 bg-slate-950/60 select-none">
                                    {rowIdx + 1}
                                </td>
                                {row.map((cell, cellIdx) => {
                                    const isNum = colTypes[cellIdx] === 'number';
                                    return (
                                        <td
                                            key={cellIdx}
                                            className={`py-1.5 px-3 border-r border-slate-800/60 whitespace-nowrap max-w-[320px] overflow-hidden text-ellipsis ${
                                                isNum ? 'text-right font-mono text-sky-300' : 'text-left text-slate-200'
                                            }`}
                                        >
                                            {cell === null || cell === undefined ? (
                                                <span className="text-slate-600 font-mono text-[10px] px-1 py-0.5 rounded bg-slate-900">NULL</span>
                                            ) : isNum ? (
                                                Number(cell).toLocaleString(undefined, { maximumFractionDigits: 2 })
                                            ) : (
                                                String(cell)
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ResultsTable;

