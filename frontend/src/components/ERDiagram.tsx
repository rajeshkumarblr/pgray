
import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
    applyNodeChanges
} from 'reactflow';
import 'reactflow/dist/style.css';
import { executeQuery } from '../api';

interface ERDiagramProps {
    schema: any;
    connectionInfo: any;
    onClose: () => void;
}

const nodeWidth = 180;
const nodeHeight = 50;

// Tighter Layout Step
const R_STEP = 300;

const getRadialLayout = (nodes: Node[], edges: Edge[]) => {
    if (nodes.length === 0) return { nodes, edges };

    // 1. Calculate and find center
    const inDegree: Record<string, number> = {};
    const adj: Record<string, string[]> = {};

    nodes.forEach(n => {
        inDegree[n.id] = 0;
        adj[n.id] = [];
    });

    edges.forEach(e => {
        inDegree[e.target] = (inDegree[e.target] || 0) + 1;
        adj[e.source].push(e.target);
        adj[e.target].push(e.source);
    });

    let centerNodeId = nodes[0].id;
    let maxDegree = -1;
    nodes.forEach(n => {
        const d = inDegree[n.id] + (adj[n.id].length * 0.1);
        if (d > maxDegree) {
            maxDegree = d;
            centerNodeId = n.id;
        }
    });

    // 2. BFS Layering
    const layers: Record<number, string[]> = {};
    const visited = new Set<string>();
    const queue: { id: string, dist: number }[] = [{ id: centerNodeId, dist: 0 }];
    visited.add(centerNodeId);

    while (queue.length > 0) {
        const { id, dist } = queue.shift()!;
        if (!layers[dist]) layers[dist] = [];
        layers[dist].push(id);

        adj[id].forEach(neighbor => {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push({ id: neighbor, dist: dist + 1 });
            }
        });
    }

    const maxDist = Math.max(...Object.keys(layers).map(Number));
    nodes.forEach(n => {
        if (!visited.has(n.id)) {
            const farLayer = maxDist + 1;
            if (!layers[farLayer]) layers[farLayer] = [];
            layers[farLayer].push(n.id);
        }
    });

    // 3. Coordinate Assignment
    const placedNodes = new Map<string, { x: number, y: number }>();
    placedNodes.set(centerNodeId, { x: 0, y: 0 });

    Object.keys(layers).map(Number).sort((a, b) => a - b).forEach(layerIdx => {
        const layerNodes = layers[layerIdx];
        if (layerIdx === 0) return;

        const radius = layerIdx * R_STEP;
        const count = layerNodes.length;

        layerNodes.forEach((nodeId, i) => {
            const angle = (2 * Math.PI * i) / count + (layerIdx % 2 * 0.5);
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            placedNodes.set(nodeId, { x, y });
        });
    });

    nodes.forEach(node => {
        const pos = placedNodes.get(node.id) || { x: 0, y: 0 };
        node.position = {
            x: pos.x - nodeWidth / 2,
            y: pos.y - nodeHeight / 2
        };
        node.targetPosition = Position.Top;
        node.sourcePosition = Position.Bottom;
    });

    return { nodes, edges };
};

const ERDiagram: React.FC<ERDiagramProps> = ({ schema, connectionInfo, onClose }) => {

    // --- Persistence Logic ---
    const STORAGE_KEY = 'pgray_er_layout';

    // -- Hover Tooltip State --
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [tooltipData, setTooltipData] = useState<any>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
    // Use refs for timers to avoid closures issues
    const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    const onNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        const mouseX = event.clientX + 10;
        const mouseY = event.clientY + 10;

        hoverTimerRef.current = setTimeout(async () => {
            setHoveredNode(node.id);
            setTooltipPos({ x: mouseX, y: mouseY });
            setTooltipData(null);

            try {
                const res = await executeQuery(connectionInfo, `SELECT * FROM ${node.id} LIMIT 5`, 5);
                if (res.status === 'success') {
                    setTooltipData(res.data);
                } else {
                    setTooltipData({ error: 'Failed to fetch preview' });
                }
            } catch (err: any) {
                setTooltipData({ error: err.message || 'Preview Failed' });
            }
        }, 1000); // 1 Second response for diagram
    }, [connectionInfo]);

    const onNodeMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        setHoveredNode(null);
        setTooltipData(null);
    }, []);

    // --- Graph Initialization ---
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        if (!schema) return { nodes, edges };

        Object.keys(schema).forEach(tableName => {
            const tableData = schema[tableName];
            const columns = Array.isArray(tableData) ? tableData : tableData.columns;
            const fks = Array.isArray(tableData) ? [] : tableData.fks || [];

            nodes.push({
                id: tableName,
                data: { label: tableName, columns: columns },
                position: { x: 0, y: 0 },
                style: {
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    background: '#1e293b',
                    color: '#e2e8f0',
                    padding: '8px',
                    fontSize: '12px',
                    minWidth: '150px',
                    cursor: 'grab'
                },
                type: 'default'
            });

            const label = (
                <div style={{ textAlign: 'left' }}>
                    <div style={{ borderBottom: '1px solid #64748b', paddingBottom: '4px', marginBottom: '4px', fontWeight: 'bold', color: '#60a5fa' }}>{tableName}</div>
                    {columns.map((col: any) => (
                        <div key={col.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                            <span style={{ color: col.name === 'id' ? '#facc15' : '#cbd5e1' }}>{col.name}</span>
                            <span style={{ color: '#64748b', marginLeft: '8px' }}>{col.type}</span>
                        </div>
                    ))}
                </div>
            );
            nodes[nodes.length - 1].data.label = label;


            fks.forEach((fk: any) => {
                edges.push({
                    id: `${tableName}-${fk.column}-${fk.foreign_table}`,
                    source: tableName,
                    target: fk.foreign_table,
                    animated: true,
                    style: { stroke: '#64748b' },
                    label: fk.column,
                    labelStyle: { fill: '#94a3b8', fontSize: 10 },
                    type: ConnectionLineType.Default,
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
                });
            });
        });

        // Load Persistence
        const savedLayoutStr = localStorage.getItem(STORAGE_KEY);
        let layouted = getRadialLayout(nodes, edges);

        if (savedLayoutStr) {
            try {
                const savedPositions: Record<string, { x: number, y: number }> = JSON.parse(savedLayoutStr);
                // Apply saved positions
                let restoredCount = 0;
                layouted.nodes.forEach(n => {
                    if (savedPositions[n.id]) {
                        n.position = savedPositions[n.id];
                        restoredCount++;
                    }
                });
                console.log(`Restored layout for ${restoredCount} nodes.`);
            } catch (e) {
                console.error("Failed to load saved layout", e);
            }
        }

        return layouted;
    }, [schema]);

    const [nodes, setNodes] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => {
            setNodes((nds) => {
                const nextNodes = applyNodeChanges(changes, nds);
                // Simple persistence: save on every change/drag? 
                // Debounce might be better, but for now lets strict save on 'position' change type or dragging.
                // Check if any change has 'position'
                const hasPosChange = changes.some(c => c.type === 'position' && c.dragging);
                if (hasPosChange) {
                    const positions: Record<string, { x: number, y: number }> = {};
                    nextNodes.forEach(n => positions[n.id] = n.position);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
                }
                return nextNodes;
            });
        },
        [setNodes]
    );

    const handleResetLayout = () => {
        localStorage.removeItem(STORAGE_KEY);
        // Force re-layout by re-calculating (or just reload page? simpler to re-create nodes effectively)
        // We can just recalculate positions from scratch and setNodes.
        const layouted = getRadialLayout(nodes, edges);
        setNodes([...layouted.nodes]);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, background: '#0f172a' }}>
            <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10001, display: 'flex', gap: '10px' }}>
                <div style={{ background: '#1e293b', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', color: '#94a3b8' }}>
                    Drag to Arrange (Auto-Saved)
                </div>
                <button
                    onClick={handleResetLayout}
                    style={{
                        background: '#334155', color: '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                    }}
                    title="Reset to Auto Layout"
                >
                    Reset Layout
                </button>
                <button
                    onClick={onClose}
                    style={{
                        background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                    }}
                >
                    ✕ Close
                </button>
            </div>

            <div style={{ width: '100%', height: '100%' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    fitView
                    minZoom={0.1}
                >
                    <Background color="#334155" gap={16} />
                    <Controls style={{ background: '#1e293b', border: '1px solid #475569', fill: '#cbd5e1' }} />
                    <MiniMap style={{ background: '#1e293b', border: '1px solid #475569' }} nodeColor={() => '#3b82f6'} />
                </ReactFlow>

                {/* Diagram Tooltip */}
                {hoveredNode && tooltipPos && (
                    <div style={{
                        position: 'fixed',
                        top: tooltipPos.y,
                        left: tooltipPos.x,
                        background: '#0f172a',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '8px',
                        zIndex: 10002,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                        maxWidth: '300px',
                        maxHeight: '200px',
                        overflow: 'auto',
                        pointerEvents: 'none' // Prevent flicker logic for now, or allow?
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#facc15', marginBottom: '4px' }}>
                            Preview: {hoveredNode}
                        </div>
                        {!tooltipData ? (
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Loading...</div>
                        ) : tooltipData.error ? (
                            <div style={{ fontSize: '10px', color: '#ef4444' }}>{tooltipData.error}</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                    <tbody>
                                        {tooltipData.rows.map((row: any[], i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                                {row.map((cell: any, j: number) => (
                                                    <td key={j} style={{ padding: '2px 4px', color: '#94a3b8', maxWidth: '80px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
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
        </div>
    );
};

export default ERDiagram;
