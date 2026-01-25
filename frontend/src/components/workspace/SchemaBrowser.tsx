import React, { useState, useRef } from 'react';
import ERDiagram from '../ERDiagram';
import { executeQuery } from '../../api';

interface SchemaBrowserProps {
    schema: any;
    loadingSchema: boolean;
    connectionInfo: any;
}

const SchemaBrowser: React.FC<SchemaBrowserProps> = ({ schema, loadingSchema, connectionInfo }) => {
    const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
    const [showER, setShowER] = useState(false);

    // Hover Preview Logic
    const [hoveredTable, setHoveredTable] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewPos, setPreviewPos] = useState<{ x: number, y: number } | null>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

    const toggleTable = (table: string) => {
        setExpandedTables(prev => ({ ...prev, [table]: !prev[table] }));
    };

    const handleTableMouseEnter = (e: React.MouseEvent, table: string) => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }

        if (hoveredTable === table) return;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

        const x = e.clientX + 10;
        const y = e.clientY + 10;

        hoverTimerRef.current = setTimeout(async () => {
            setHoveredTable(table);
            setPreviewPos({ x, y });
            setPreviewData(null);

            try {
                const res = await executeQuery(connectionInfo, `SELECT * FROM ${table} LIMIT 5`, 5);
                if (res.status === 'success') {
                    setPreviewData(res.data);
                } else {
                    setPreviewData({ error: 'Failed to fetch preview' });
                }
            } catch (err: any) {
                console.error("Preview failed", err);
                setPreviewData({ error: err.message || 'Preview Failed' });
            }
        }, 2000);
    };

    const handleTableMouseLeave = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        closeTimerRef.current = setTimeout(() => {
            setHoveredTable(null);
            setPreviewData(null);
        }, 300);
    };

    const handleTooltipMouseEnter = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const handleTooltipMouseLeave = () => {
        closeTimerRef.current = setTimeout(() => {
            setHoveredTable(null);
            setPreviewData(null);
        }, 300);
    };

    return (
        <div style={{ width: '250px', borderRight: '1px solid #334155', background: '#0f172a', padding: '10px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', margin: 0 }}>SCHEMA BROWSER</h3>
                <button
                    onClick={() => setShowER(true)}
                    style={{
                        background: 'transparent', border: '1px solid #475569', color: '#cbd5e1',
                        padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px'
                    }}
                    title="View ER Relationship Diagram"
                >
                    🔗 ER
                </button>
            </div>

            {loadingSchema && <span style={{ fontSize: '11px', color: '#64748b' }}>Loading...</span>}

            {showER && schema && (
                <ERDiagram schema={schema} connectionInfo={connectionInfo} onClose={() => setShowER(false)} />
            )}

            {schema && (
                <div style={{ fontSize: '13px' }}>
                    {Object.keys(schema).sort().map(table => {
                        const tableData = schema[table];
                        const columns = Array.isArray(tableData) ? tableData : tableData.columns;
                        const isExpanded = expandedTables[table];

                        return (
                            <div key={table} style={{ marginBottom: '4px' }}>
                                <div
                                    onClick={() => toggleTable(table)}
                                    onMouseEnter={(e) => handleTableMouseEnter(e, table)}
                                    onMouseLeave={handleTableMouseLeave}
                                    style={{
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px 6px',
                                        borderRadius: '4px',
                                        background: isExpanded ? '#1e293b' : 'transparent',
                                        color: isExpanded ? '#60a5fa' : '#94a3b8',
                                        position: 'relative'
                                    }}
                                >
                                    <span style={{ marginRight: '6px', fontSize: '10px', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                                    <span style={{ fontWeight: 600 }}>{table}</span>
                                </div>
                                {isExpanded && (
                                    <div style={{ paddingLeft: '14px', marginTop: '2px', borderLeft: '1px solid #334155', marginLeft: '9px' }}>
                                        {columns && columns.length > 0 && (
                                            <div style={{ marginBottom: '8px' }}>
                                                <div style={{ fontSize: '10px', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>Columns</div>
                                                {columns.map((col: any) => (
                                                    <div key={col.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: '12px' }}>
                                                        <span style={{ color: '#cbd5e1' }}>{col.name}</span>
                                                        <span style={{ fontSize: '10px', color: '#64748b' }}>{col.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Floating Preview Tooltip */}
            {hoveredTable && previewPos && (
                <div
                    onMouseEnter={handleTooltipMouseEnter}
                    onMouseLeave={handleTooltipMouseLeave}
                    style={{
                        position: 'fixed',
                        top: previewPos.y,
                        left: previewPos.x,
                        background: '#0f172a',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '8px',
                        zIndex: 9999,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                        maxWidth: '400px',
                        maxHeight: '300px',
                        overflow: 'auto'
                    }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#facc15', marginBottom: '4px' }}>
                        Preview: {hoveredTable}
                    </div>
                    {!previewData ? (
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>Loading...</div>
                    ) : previewData.error ? (
                        <div style={{ fontSize: '10px', color: '#ef4444' }}>{previewData.error}</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                <thead>
                                    <tr>
                                        {previewData.columns.map((col: string) => (
                                            <th key={col} style={{ borderBottom: '1px solid #334155', padding: '2px 4px', color: '#cbd5e1', textAlign: 'left' }}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.rows.map((row: any[], i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                            {row.map((cell: any, j: number) => (
                                                <td key={j} style={{ padding: '2px 4px', color: '#94a3b8', maxWidth: '100px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                                    {String(cell)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SchemaBrowser;
