import React from 'react';

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
            <div style={{ padding: '20px', color: '#e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>✅ {data.message}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>{data.rowCount} rows affected.</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    color: '#e2e8f0',
                    textAlign: 'left'
                }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                        <tr>
                            {data.columns.map((col, idx) => (
                                <th key={idx} style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #475569',
                                    borderRight: '1px solid #334155',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 600,
                                    color: '#94a3b8'
                                }}>
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, rowIdx) => (
                            <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? 'transparent' : '#33415550' }}>
                                {row.map((cell, cellIdx) => (
                                    <td key={cellIdx} style={{
                                        padding: '6px 12px',
                                        borderBottom: '1px solid #334155',
                                        borderRight: '1px solid #334155',
                                        whiteSpace: 'nowrap',
                                        maxWidth: '300px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {cell === null ? <span style={{ color: '#64748b', fontStyle: 'italic' }}>null</span> : String(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

        </div>
    );
};

export default ResultsTable;
