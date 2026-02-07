import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    Position,
    ConnectionLineType,
    MarkerType,
    OnNodesChange,
    applyNodeChanges,
    Handle,
    NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';
import { saveERLayout, getERLayout } from '../api';
import { applyLayout, LayoutMode } from '../utils/layoutEngine';

interface ERDiagramProps {
    schema: any;
    connectionInfo: any;
    onClose?: () => void;
}

// --- Custom Table Node ---
const TableNode = ({ data, selected }: NodeProps) => {
    const [expanded, setExpanded] = useState(false);

    // Columns: { name, type, isPk, isFk }
    const columns = data.columns || [];

    // Filter columns based on expanded state
    const visibleColumns = expanded
        ? columns
        : columns.filter((c: any) => c.isPk || c.isFk);

    const hasHidden = !expanded && columns.length > visibleColumns.length;

    return (
        <div style={{
            background: '#1e293b',
            border: selected ? '2px solid #3b82f6' : '1px solid #475569',
            borderRadius: '8px',
            minWidth: '180px',
            color: '#e2e8f0',
            fontSize: '13px',
            boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.6)',
            transition: 'all 0.2s ease'
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 12px',
                borderBottom: '1px solid #334155',
                background: '#0f172a',
                borderRadius: '8px 8px 0 0',
                fontWeight: 'bold',
                fontSize: '14px',
                letterSpacing: '0.02em',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: '#60a5fa' }}>{data.label}</span>
                {hasHidden && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '10px' }}
                    >
                        Show All
                    </button>
                )}
                {expanded && columns.length > visibleColumns.length && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '10px' }}
                    >
                        Compact
                    </button>
                )}
            </div>

            {/* Columns */}
            <div style={{ padding: '4px 0' }}>
                {visibleColumns.map((col: any) => (
                    <div key={col.name} style={{
                        position: 'relative',
                        padding: '4px 8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: col.isPk ? '#3b82f622' : 'transparent'
                    }}>
                        {/* Target Handle (Incoming FK) - usually on PKs */}
                        <Handle
                            type="target"
                            position={Position.Left}
                            id={`${col.name}-target`}
                            style={{ background: '#cbd5e1', width: '6px', height: '6px' }}
                        />

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                            {col.isPk && <span style={{ color: '#facc15', fontSize: '10px' }}>🔑</span>}
                            {col.isFk && <span style={{ color: '#a5b4fc', fontSize: '10px' }}>🔗</span>}
                            <span style={{
                                fontWeight: col.isPk ? 'bold' : 'normal',
                                color: col.isPk ? '#e2e8f0' : (col.isFk ? '#e2e8f0' : '#cbd5e1')
                            }}>
                                {col.name}
                            </span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '10px' }}>{col.type}</span>

                        {/* Source Handle (Outgoing FK) - usually on FKs */}
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={`${col.name}-source`}
                            style={{ background: '#cbd5e1', width: '6px', height: '6px' }}
                        />
                    </div>
                ))}
                {hasHidden && (
                    <div
                        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                        style={{ padding: '4px 8px', color: '#64748b', fontSize: '10px', fontStyle: 'italic', cursor: 'pointer', textAlign: 'center' }}
                    >
                        ... {columns.length - visibleColumns.length} more columns
                    </div>
                )}
            </div>
        </div>
    );
};

const nodeTypes = {
    table: TableNode
};

interface ERDiagramProps {
    schema: any;
    connectionInfo: any;
}

const ERDiagram: React.FC<ERDiagramProps> = ({ schema, connectionInfo }) => {

    const STORAGE_KEY = `pgray_er_layout_${connectionInfo?.database || 'default'}`;
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('auto');
    const [highlightedNode, setHighlightedNode] = useState<string | null>(null);

    // --- Graph State ---
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        if (!schema) return { nodes: [], edges: [] };

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        Object.keys(schema).forEach(tableName => {
            const tableData = schema[tableName];
            // Normalize columns
            const rawColumns = Array.isArray(tableData) ? tableData : tableData.columns;
            const fks = Array.isArray(tableData) ? [] : tableData.fks || [];

            // Mark PK/FK in columns
            const columns = rawColumns.map((c: any) => ({
                ...c,
                isPk: c.name === 'id' || c.name.endsWith('_id') && !c.name.includes('_'), // Heuristic if no explicit PK loaded
                // Actually, tableData.pk usually isn't passed here. 
                // We rely on name or if it is a source of an FK?
                // Let's rely on standard 'id' or explicit PK if available.
                // NOTE: SchemaBrowser loads columns. We might need to enrich this upstream.
                // For now, let's assume 'id' is PK, and any column in fks list is FK.
                isFk: fks.some((fk: any) => fk.column === c.name)
            }));

            // Fix PK detection if 'id' exists
            columns.forEach((c: any) => {
                if (c.name === 'id') c.isPk = true;
            });

            nodes.push({
                id: tableName,
                type: 'table',
                data: { label: tableName, columns: columns },
                position: { x: 0, y: 0 },
            });

            fks.forEach((fk: any) => {
                // Edge from FK column (Source) to PK column (Target)
                // Source: Table with FK. SourceHandle: fk.column-source
                // Target: Referenced Table. TargetHandle: fk.foreign_column (usually id)-target

                // We need to know the foreign column. Usually 'id' if not specified? 
                // Postgres constraint info usually provides pkey.
                // Assuming 'id' for target if unknown.
                const targetCol = 'id';

                edges.push({
                    id: `${tableName}-${fk.column}-${fk.foreign_table}`,
                    source: tableName,
                    target: fk.foreign_table,
                    sourceHandle: `${fk.column}-source`,
                    targetHandle: `${targetCol}-target`,
                    animated: false,
                    style: { stroke: '#64748b', strokeWidth: 1.5 },
                    type: ConnectionLineType.SmoothStep,
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
                });
            });
        });

        // 1. Try Load Persistence from API (Async)
        // We can't do async inside useMemo easily for layout setup.
        // Instead, we will effect-load it.
        // But for initial render, we can use localStorage as cache or just wait.
        // Let's rely on an effect to load positions and apply them.

        // Apply layout based on current mode
        return applyLayout(nodes, edges, layoutMode);

    }, [schema, layoutMode]);

    const [nodes, setNodes] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Load layout from Backend
    useEffect(() => {
        const loadLayout = async () => {
            if (!connectionInfo) return;
            try {
                // Try API first
                const layout = await getERLayout(connectionInfo);
                if (layout) {
                    setNodes((nds) => nds.map(n => {
                        if (layout[n.id]) {
                            return { ...n, position: layout[n.id] };
                        }
                        return n;
                    }));
                    return;
                }

                // Fallback to local storage if API failed or empty (migration)
                const savedLayoutStr = localStorage.getItem(STORAGE_KEY);
                if (savedLayoutStr) {
                    const savedPositions = JSON.parse(savedLayoutStr);
                    setNodes((nds) => nds.map(n => {
                        if (savedPositions[n.id]) {
                            return { ...n, position: savedPositions[n.id] };
                        }
                        return n;
                    }));
                }
            } catch (e) {
                console.error("Error loading layout", e);
            }
        };
        // Only load layout if we have nodes (schema loaded)
        if (nodes.length > 0) {
            loadLayout();
        }
    }, [connectionInfo, setNodes, STORAGE_KEY, nodes.length]);

    // Sync state when schema changes (Fix for empty diagram on load)
    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);


    const onNodesChange: OnNodesChange = useCallback(
        (changes) => {
            setNodes((nds) => applyNodeChanges(changes, nds));
            // We don't auto-save to backend on every drag to avoid spam.
            // We can perhaps auto-save to localStorage as temporary cache if we wanted,
            // but user asked for explicit save button. 
            // Let's keep localStorage as a "draft" state?
            // Actually user said "I want a save button... so next time... they can be arranged".
            // So implicit auto-save might be confusing if they want to discard?
            // "Auto-Saved" label was there before. 
            // Let's implement explicit save for backend, and maybe keep localStorage as backup.
        },
        [setNodes]
    );

    const handleSaveLayout = async () => {
        if (!connectionInfo) return;
        const positions: Record<string, { x: number, y: number }> = {};
        nodes.forEach(n => positions[n.id] = n.position);

        // Save to Backend
        await saveERLayout(positions, connectionInfo);

        // Also save to localStorage for offline/faster load
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));

        alert("Layout saved!");
    };

    const handleResetLayout = () => {
        if (confirm(`Apply ${layoutMode === 'auto' ? 'auto-detected' : layoutMode} layout?`)) {
            localStorage.removeItem(STORAGE_KEY);
            // Recalculate layout using the selected mode
            const { nodes: newNodes, edges: newEdges } = applyLayout(nodes, edges, layoutMode);
            setNodes([...newNodes]);
            setEdges([...newEdges]);
        }
    };

    return (
        <div style={{ height: '100%', width: '100%', background: '#0f172a', position: 'relative' }}>
            {/* Toolbar */}
            <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Layout Mode Selector */}
                <div style={{ display: 'flex', background: '#1e293b', borderRadius: '6px', border: '1px solid #475569', overflow: 'hidden' }}>
                    {[
                        { mode: 'auto' as LayoutMode, label: '🪄 Auto' },
                        { mode: 'hierarchical' as LayoutMode, label: '→ Flow' },
                        { mode: 'star' as LayoutMode, label: '✦ Star' }
                    ].map(({ mode, label }) => (
                        <button
                            key={mode}
                            onClick={() => setLayoutMode(mode)}
                            style={{
                                background: layoutMode === mode ? '#3b82f6' : 'transparent',
                                color: layoutMode === mode ? 'white' : '#94a3b8',
                                border: 'none',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: layoutMode === mode ? 'bold' : 'normal',
                                transition: 'all 0.2s'
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={handleResetLayout}
                    style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                    title="Apply selected layout"
                >
                    🔄 Apply Layout
                </button>
                <button
                    onClick={handleSaveLayout}
                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                    💾 Save
                </button>
            </div>

            <ReactFlow
                nodes={nodes.map(n => ({
                    ...n,
                    style: {
                        ...n.style,
                        opacity: highlightedNode && highlightedNode !== n.id &&
                            !edges.some(e => (e.source === highlightedNode && e.target === n.id) || (e.target === highlightedNode && e.source === n.id))
                            ? 0.25 : 1,
                        transition: 'opacity 0.2s ease'
                    }
                }))}
                edges={edges.map(e => ({
                    ...e,
                    style: {
                        ...e.style,
                        stroke: highlightedNode && (e.source === highlightedNode || e.target === highlightedNode)
                            ? '#3b82f6' : '#475569',
                        strokeWidth: highlightedNode && (e.source === highlightedNode || e.target === highlightedNode)
                            ? 2.5 : 1.5,
                        opacity: highlightedNode && e.source !== highlightedNode && e.target !== highlightedNode
                            ? 0.15 : 1,
                        transition: 'all 0.2s ease'
                    }
                }))}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeMouseEnter={(_, node) => setHighlightedNode(node.id)}
                onNodeMouseLeave={() => setHighlightedNode(null)}
                onPaneClick={() => setHighlightedNode(null)}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
            >
                <Background color="#1e293b" gap={16} />
                <Controls style={{ background: '#1e293b', border: '1px solid #475569', fill: '#cbd5e1' }} />
            </ReactFlow>
        </div>
    );
};

export default ERDiagram;
