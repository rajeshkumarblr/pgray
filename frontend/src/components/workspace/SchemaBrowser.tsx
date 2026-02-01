import React, { useState, useRef } from 'react';
import ERDiagram from '../ERDiagram';
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
    selectedTables, setSelectedTables, onShowER
}) => {
    const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

    const toggleSelection = (table: string) => {
        const newSet = new Set(selectedTables);
        if (newSet.has(table)) {
            newSet.delete(table);
        } else {
            newSet.add(table);
        }
        setSelectedTables(newSet);
    };

    const toggleSelectAll = () => {
        if (!schema) return;
        const allTables = Object.keys(schema);
        if (selectedTables.size === allTables.length) {
            setSelectedTables(new Set());
        } else {
            setSelectedTables(new Set(allTables));
        }
    };

    // Derived filtered schema is now calculated in QueryWorkspace, so we don't strictly need it here unless needed for something else.
    // It's not used here anymore since ER display is lifted.


    // Hover Preview Logic (unchanged)
    const [hoveredTable, setHoveredTable] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewPos, setPreviewPos] = useState<{ x: number, y: number } | null>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

    const toggleTable = (table: string) => {
        setExpandedTables(prev => ({ ...prev, [table]: !prev[table] }));
    };

    // ... (mouse handlers unchanged)

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

    // ... other handlers ...

    return (
        <div style={{ height: '100%', overflowY: 'auto', padding: '10px', background: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#94a3b8', margin: 0 }}>SCHEMA BROWSER</h3>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={toggleSelectAll}
                        style={{
                            background: 'transparent', border: 'none', color: '#64748b',
                            cursor: 'pointer', fontSize: '11px', textDecoration: 'underline'
                        }}
                    >
                        {schema && selectedTables.size === Object.keys(schema).length ? 'Unselect All' : 'Select All'}
                    </button>
                    <button
                        onClick={onShowER}
                        style={{
                            background: 'transparent', border: '1px solid #475569', color: '#cbd5e1',
                            padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px'
                        }}
                        title="View ER Relationship Diagram for Selected Tables"
                    >
                        🔗 ER Diagram
                    </button>
                </div>
            </div>

            {loadingSchema && <span style={{ fontSize: '11px', color: '#64748b' }}>Loading...</span>}

            {/* removed embedded ERDiagram */}

            {schema && (
                <div style={{ fontSize: '13px' }}>
                    {Object.keys(schema).sort().map(table => {
                        const tableData = schema[table];
                        const columns = Array.isArray(tableData) ? tableData : tableData.columns;
                        const isExpanded = expandedTables[table];
                        const isSelected = selectedTables.has(table);

                        return (
                            <div key={table} style={{ marginBottom: '4px' }}>
                                <div
                                    onMouseEnter={(e) => handleTableMouseEnter(e, table)}
                                    onMouseLeave={handleTableMouseLeave}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px 6px',
                                        borderRadius: '4px',
                                        background: isExpanded ? '#1e293b' : 'transparent',
                                        color: isExpanded ? '#60a5fa' : '#94a3b8',
                                        position: 'relative'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelection(table)}
                                        style={{ marginRight: '8px', cursor: 'pointer' }}
                                    />

                                    <div
                                        onClick={() => toggleTable(table)}
                                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}
                                    >
                                        <span style={{ marginRight: '6px', fontSize: '10px', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                                        <span style={{ fontWeight: 600 }}>{table}</span>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div style={{ paddingLeft: '34px', marginTop: '2px', marginLeft: '0px' }}>
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
