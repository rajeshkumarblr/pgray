import React, { useMemo } from 'react';

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
    if (!data) return null;

    if (data.message && data.columns.length === 0) {
        return (
            <div className="p-5 text-slate-300 text-center">
                <div className="text-base mb-2">✅ {data.message}</div>
                <div className="text-xs text-slate-400">{data.rowCount} rows affected.</div>
            </div>
        );
    }

    // Determine column types based on first few rows
    const colTypes = useMemo(() => {
        if (!data.rows || data.rows.length === 0) return data.columns.map(() => 'string');
        return data.columns.map((_, i) => {
            let isNum = true;
            let distinctValues = 0;
            // Scan first 20 rows
            for (let r = 0; r < Math.min(data.rows.length, 20); r++) {
                const val = data.rows[r][i];
                if (val !== null && val !== undefined && val !== '') {
                    distinctValues++;
                    const num = Number(val);
                    if (isNaN(num) || typeof val === 'object') { // Dates are objects or strings, handle cautiously
                        // Strict check: if it's a string that parses to number but visually isn't (e.g. "00123"), treat as string?
                        // For now, simple check: if typeof val is number or string that parses safely
                        if (typeof val === 'string' && !/^-?\d*(\.\d+)?$/.test(val)) {
                            isNum = false; break;
                        }
                    }
                }
            }
            return (distinctValues > 0 && isNum) ? 'number' : 'string';
        });
    }, [data.rows, data.columns]);

    return (
        <div className="flex flex-col h-full bg-slate-900">
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full border-collapse text-sm text-slate-300">
                    <thead className="sticky top-0 bg-slate-950 z-10 shadow-sm">
                        <tr>
                            {data.columns.map((col, idx) => (
                                <th key={idx} className={`
                                    p-3 border-b border-slate-700 border-r border-slate-800 
                                    whitespace-nowrap font-semibold text-slate-400 uppercase text-xs tracking-wider
                                    ${colTypes[idx] === 'number' ? 'text-right' : 'text-left'}
                                `}>
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, rowIdx) => (
                            <tr key={(row as any)._id || rowIdx} className="hover:bg-slate-800/50 transition-colors group">
                                {row.map((cell, cellIdx) => {
                                    const isNum = colTypes[cellIdx] === 'number';
                                    return (
                                        <td key={cellIdx} className={`
                                            p-2 border-b border-slate-800 border-r border-slate-800 
                                            whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis
                                            ${isNum ? 'text-right font-mono text-blue-300' : 'text-left text-slate-300'}
                                        `}>
                                            {cell === null ? (
                                                <span className="text-slate-600 italic text-xs">NULL</span>
                                            ) : (
                                                isNum ? Number(cell).toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(cell)
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* Footer / Pagination could go here */}
        </div>
    );
};

export default ResultsTable;
