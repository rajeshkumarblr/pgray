import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
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
            borderRadius: '6px',
            minWidth: '200px',
            color: '#e2e8f0',
            fontSize: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
        }}>
            {/* Header */}
            <div style={{
                padding: '8px',
                borderBottom: '1px solid #334155',
                background: '#0f172a',
                borderRadius: '6px 6px 0 0',
                fontWeight: 'bold',
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
                {expanded && columns.length > visibleColumns.length && ( // Only show collapse if we are actually filtering
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

// --- STAR / RADIAL LAYOUT ---
const getStarLayout = (nodes: Node[], edges: Edge[]) => {
    if (nodes.length === 0) return { nodes, edges };

    // 1. Calculate degrees to find center
    const degree: Record<string, number> = {};
    const adj: Record<string, string[]> = {};

    nodes.forEach(n => {
        degree[n.id] = 0;
        adj[n.id] = [];
    });

    edges.forEach(e => {
        degree[e.source] = (degree[e.source] || 0) + 1;
        degree[e.target] = (degree[e.target] || 0) + 1;
        adj[e.source].push(e.target);
        adj[e.target].push(e.source);
    });

    // Find node with max degree
    let centerNodeId = nodes[0].id;
    let maxDegree = -1;
    nodes.forEach(n => {
        if ((degree[n.id] || 0) > maxDegree) {
            maxDegree = degree[n.id];
            centerNodeId = n.id;
        }
    });

    // 2. BFS for layering + Parent tracking
    const layers: Record<number, string[]> = {};
    const visited = new Set<string>();
    const parents: Record<string, string> = {}; // Track parent for angle sorting

    // BFS Queue: { id, dist, parent }
    const queue: { id: string, dist: number, parent: string | null }[] = [{ id: centerNodeId, dist: 0, parent: null }];
    visited.add(centerNodeId);

    while (queue.length > 0) {
        const { id, dist, parent } = queue.shift()!;
        if (!layers[dist]) layers[dist] = [];
        layers[dist].push(id);
        if (parent) parents[id] = parent;

        adj[id].forEach(neighbor => {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push({ id: neighbor, dist: dist + 1, parent: id });
            }
        });
    }

    // Handle orphans
    const maxLayer = Math.max(...Object.keys(layers).map(Number));
    const orphanLayer = maxLayer + 1;
    nodes.forEach(n => {
        if (!visited.has(n.id)) {
            if (!layers[orphanLayer]) layers[orphanLayer] = [];
            layers[orphanLayer].push(n.id);
        }
    });

    // 3. Position assignment with Parent-Aware sorting
    const R_STEP = 250; // Tighter radius (was 350)
    const placedNodes = new Map<string, { x: number, y: number, angle: number }>();
    placedNodes.set(centerNodeId, { x: 0, y: 0, angle: 0 });

    const layerIndices = Object.keys(layers).map(Number).sort((a, b) => a - b);

    layerIndices.forEach(layerIdx => {
        if (layerIdx === 0) return;

        let layerNodes = layers[layerIdx];
        const radius = layerIdx * R_STEP;

        // Sort nodes by parent's angle to keep subtrees closer
        if (layerIdx > 1) {
            layerNodes.sort((a, b) => {
                const parentA = parents[a];
                const parentB = parents[b];
                const angleA = placedNodes.get(parentA)?.angle || 0;
                const angleB = placedNodes.get(parentB)?.angle || 0;
                return angleA - angleB;
            });
        }

        const count = layerNodes.length;
        const angleStep = (2 * Math.PI) / count;

        layerNodes.forEach((nodeId, i) => {
            const angle = i * angleStep;
            placedNodes.set(nodeId, {
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
                angle: angle
            });
        });
    });

    // Apply positions
    nodes.forEach(node => {
        const pos = placedNodes.get(node.id) || { x: 0, y: 0 };
        node.position = {
            x: pos.x - 100, // Center offset
            y: pos.y - 25
        };
        node.targetPosition = Position.Left;
        node.sourcePosition = Position.Right;
    });

    return { nodes, edges };
};

interface ERDiagramProps {
    schema: any;
    connectionInfo: any;
}

const ERDiagram: React.FC<ERDiagramProps> = ({ schema, connectionInfo }) => {

    const STORAGE_KEY = `pgray_er_layout_${connectionInfo?.database || 'default'}`;

    // --- Hover Tooltip State ---
    // --- Hover Tooltip State (Removed) ---

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

        // Use Star Layout as default
        return getStarLayout(nodes, edges);

    }, [schema]);

    const [nodes, setNodes] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [layoutLoaded, setLayoutLoaded] = useState(false);

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
                    setLayoutLoaded(true);
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
        if (confirm("Reset layout to default star arrangement?")) {
            localStorage.removeItem(STORAGE_KEY);
            // Recalculate layout
            const { nodes: newNodes, edges: newEdges } = getStarLayout(nodes, edges);
            setNodes([...newNodes]);
            setEdges([...newEdges]);
        }
    };

    return (
        <div style={{ height: '100%', width: '100%', background: '#0f172a', position: 'relative' }}>
            {/* Toolbar */}
            <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, display: 'flex', gap: '10px' }}>
                <button
                    onClick={handleSaveLayout}
                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Save Layout
                </button>
                <button
                    onClick={handleResetLayout}
                    style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Reset Layout
                </button>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
            >
                <Background color="#1e293b" gap={16} />
                <Controls style={{ background: '#1e293b', border: '1px solid #475569', fill: '#cbd5e1' }} />
                <MiniMap style={{ background: '#1e293b', border: '1px solid #475569' }} nodeColor="#3b82f6" />
            </ReactFlow>
        </div>
    );
};

export default ERDiagram;
