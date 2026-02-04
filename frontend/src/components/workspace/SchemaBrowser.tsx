import React, { useState, useRef, useEffect } from 'react';
import { executeQuery } from '../../api';

interface SchemaBrowserProps {
    schema: any;
    loadingSchema: boolean;
    connectionInfo: any;
    selectedTables: Set<string>;
    setSelectedTables: (tables: Set<string>) => void;
    onShowER: () => void;
}

const SchemaBrowser: React.FC<SchemaBrowserProps> = ({
    schema, loadingSchema, connectionInfo,
    onShowER
}) => {
    const [activeTable, setActiveTable] = useState<string | null>(null);

    // Auto-select first table if none active
    useEffect(() => {
        if (schema && !activeTable) {
            const tables = Object.keys(schema).sort();
            if (tables.length > 0) setActiveTable(tables[0]);
        }
    }, [schema, activeTable]);



    // Hover Preview Logic
    const [hoveredTable, setHoveredTable] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewPos, setPreviewPos] = useState<{ x: number, y: number } | null>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleTableMouseEnter = (e: React.MouseEvent, table: string) => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        if (hoveredTable === table) return;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = rect.right + 10;
        const y = rect.top;

        hoverTimerRef.current = setTimeout(async () => {
            setHoveredTable(table);
            setPreviewPos({ x, y });
            setPreviewData(null);
            try {
                const res = await executeQuery(connectionInfo, `SELECT * FROM "${table}" LIMIT 5`, 5);
                if (res.status === 'success') {
                    setPreviewData(res.data);
                } else {
                    setPreviewData({ error: 'Failed to fetch preview' });
                }
            } catch (err: any) {
                setPreviewData({ error: err.message || 'Preview Failed' });
            }
        }, 1500);
    };

    const handleTableMouseLeave = () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
            setHoveredTable(null);
            setPreviewPos(null);
            setPreviewData(null);
        }, 300);
    };

    // Keep tooltip open when hovering it
    const handleTooltipMouseEnter = () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
    const handleTooltipMouseLeave = () => {
        setHoveredTable(null);
        setPreviewPos(null);
        setPreviewData(null);
    };


    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', background: '#0f172a', overflow: 'hidden' }}>
            {/* LEFT PANE: Table List */}
            <div style={{
                width: '260px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column',
                background: '#1e293b'
            }}>
                <div style={{ padding: '10px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', margin: 0 }}>TABLES</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={onShowER} title="View ER Diagram" style={{ background: 'none', border: '1px solid #475569', borderRadius: '3px', padding: '1px 4px', color: '#cbd5e1', cursor: 'pointer', fontSize: '10px' }}>
                            🔗 ER
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }}>
                    {loadingSchema && <div style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>Loading schema...</div>}
                    {schema && Object.keys(schema).sort().map(table => (
                        <div key={table}
                            onMouseEnter={(e) => handleTableMouseEnter(e, table)}
                            onMouseLeave={handleTableMouseLeave}
                            onClick={() => setActiveTable(table)}
                            style={{
                                display: 'flex', alignItems: 'center', padding: '6px 8px', marginBottom: '2px',
                                cursor: 'pointer', borderRadius: '4px',
                                background: activeTable === table ? '#334155' : 'transparent',
                                color: activeTable === table ? '#fff' : '#cbd5e1',
                                justifyContent: 'space-between'
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table}</span>
                            </div>
                            {activeTable === table && <span style={{ fontSize: '10px', color: '#60a5fa' }}>▶</span>}
                        </div>
                    ))}
                </div>
            </div>

            {/* RIGHT PANE: Details */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#0f172a' }}>
                {!activeTable && <div style={{ color: '#64748b', fontSize: '14px' }}>Select a table to view details</div>}
                {activeTable && schema && schema[activeTable] && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #334155' }}>
                            <div style={{ width: '32px', height: '32px', background: '#3b82f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '10px' }}>
                                <span style={{ fontSize: '16px' }}>📋</span>
                            </div>
                            <h2 style={{ fontSize: '20px', color: '#f8fafc', margin: 0 }}>
                                {activeTable}
                            </h2>
                        </div>

                        {/* COLUMNS */}
                        <div style={{ marginBottom: '30px', background: '#1e293b', borderRadius: '6px', border: '1px solid #334155', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 15px', background: '#334155', borderBottom: '1px solid #475569' }}>
                                <h3 style={{ fontSize: '12px', color: '#e2e8f0', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>Fields</h3>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#1e293b', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 15px', color: '#94a3b8', borderBottom: '1px solid #334155', width: '30%', fontWeight: 600 }}>Name</th>
                                        <th style={{ padding: '10px 15px', color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 600 }}>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(schema[activeTable].columns || []).map((col: any, idx: number) => (
                                        <tr key={col.name} style={{ borderBottom: idx === (schema[activeTable].columns || []).length - 1 ? 'none' : '1px solid #334155' }}>
                                            <td style={{ padding: '8px 15px', color: '#e2e8f0', fontFamily: 'monospace' }}>{col.name}</td>
                                            <td style={{ padding: '8px 15px', color: '#cbd5e1', fontFamily: 'monospace' }}>{col.type}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* INDEXES */}
                        <div style={{ background: '#1e293b', borderRadius: '6px', border: '1px solid #334155', overflow: 'hidden' }}>
                            <div style={{ padding: '10px 15px', background: '#334155', borderBottom: '1px solid #475569' }}>
                                <h3 style={{ fontSize: '12px', color: '#e2e8f0', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>Indexes</h3>
                            </div>
                            {(!schema[activeTable].indexes || schema[activeTable].indexes.length === 0) ? (
                                <div style={{ padding: '15px', color: '#64748b', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>No indexes found for this table.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ background: '#1e293b', textAlign: 'left' }}>
                                            <th style={{ padding: '10px 15px', color: '#94a3b8', borderBottom: '1px solid #334155', width: '30%', fontWeight: 600 }}>Index Name</th>
                                            <th style={{ padding: '10px 15px', color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 600 }}>Definition</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schema[activeTable].indexes.map((idx: any, i: number) => (
                                            <tr key={idx.name} style={{ borderBottom: i === schema[activeTable].indexes.length - 1 ? 'none' : '1px solid #334155' }}>
                                                <td style={{ padding: '8px 15px', color: '#e2e8f0', fontFamily: 'monospace', verticalAlign: 'top' }}>{idx.name}</td>
                                                <td style={{ padding: '8px 15px', color: '#cbd5e1', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{idx.def}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* HOVER PREVIEW TOOLTIP */}
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
                        padding: '10px',
                        zIndex: 9999,
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                        maxWidth: '400px',
                        maxHeight: '300px',
                        overflow: 'auto'
                    }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#facc15', marginBottom: '5px' }}>Preview: {hoveredTable}</div>
                    {!previewData ? <div style={{ color: '#64748b', fontSize: '11px' }}>Loading data...</div> :
                        previewData.error ? <div style={{ color: '#ef4444', fontSize: '11px' }}>{previewData.error}</div> :
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                    <thead>
                                        <tr>{previewData.columns.map((c: string) => <th key={c} style={{ textAlign: 'left', color: '#94a3b8', padding: '2px 4px', borderBottom: '1px solid #334155' }}>{c}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {previewData.rows.map((r: any[], i: number) => (
                                            <tr key={i}>{r.map((c: any, j: number) => <td key={j} style={{ color: '#cbd5e1', padding: '2px 4px', borderBottom: '1px solid #1e293b', whiteSpace: 'nowrap' }}>{String(c)}</td>)}</tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                    }
                </div>
            )}
        </div>
    );
};

export default SchemaBrowser;
