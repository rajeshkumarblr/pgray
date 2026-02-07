import dagre from 'dagre';
import { Node, Edge, Position } from 'reactflow';

// Strategy 1: Hierarchical Layout using Dagre (Left-to-Right)
export const getDagreLayout = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    if (nodes.length === 0) return { nodes, edges };

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 40,
        ranksep: 70,
        edgesep: 30
    });

    nodes.forEach((node) => {
        // Calculate height based on VISIBLE columns only (PKs and FKs)
        const columns = node.data?.columns || [];
        const visibleCount = columns.filter((c: any) => c.isPk || c.isFk).length;
        // Base height (header ~50px) + row height (28px each) + padding (20px)
        const height = 50 + (visibleCount * 28) + 20;
        dagreGraph.setNode(node.id, { width: 220, height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const columns = node.data?.columns || [];
        const visibleCount = columns.filter((c: any) => c.isPk || c.isFk).length;
        const height = 50 + (visibleCount * 28) + 20;

        return {
            ...node,
            targetPosition: isHorizontal ? Position.Left : Position.Top,
            sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
            position: {
                x: nodeWithPosition.x - 110, // center offset (width/2)
                y: nodeWithPosition.y - height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

// Strategy 2: Star/Radial Layout (existing logic, refactored)
export const getStarLayout = (nodes: Node[], edges: Edge[]) => {
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
    const parents: Record<string, string> = {};

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
    const maxLayer = Math.max(...Object.keys(layers).map(Number), 0);
    const orphanLayer = maxLayer + 1;
    nodes.forEach(n => {
        if (!visited.has(n.id)) {
            if (!layers[orphanLayer]) layers[orphanLayer] = [];
            layers[orphanLayer].push(n.id);
        }
    });

    // 3. Position assignment with Parent-Aware sorting
    const R_STEP = 280;
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
    const layoutedNodes = nodes.map(node => {
        const pos = placedNodes.get(node.id) || { x: 0, y: 0 };
        return {
            ...node,
            position: {
                x: pos.x - 100,
                y: pos.y - 50
            },
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
        };
    });

    return { nodes: layoutedNodes, edges };
};

// Smart Auto-Selection
export const getSmartLayout = (nodes: Node[], edges: Edge[]) => {
    if (nodes.length === 0) return { nodes, edges };

    // Heuristic: If one node has > 40% of all connections, it's likely a Star schema.
    // Otherwise, default to Dagre (Hierarchical).
    const connectionCounts: Record<string, number> = {};
    edges.forEach(e => {
        connectionCounts[e.source] = (connectionCounts[e.source] || 0) + 1;
        connectionCounts[e.target] = (connectionCounts[e.target] || 0) + 1;
    });

    const counts = Object.values(connectionCounts);
    const maxConnections = counts.length > 0 ? Math.max(...counts) : 0;
    const totalNodes = nodes.length;

    // Star schema: one central node with many connections
    const isStar = totalNodes > 2 && maxConnections > (totalNodes * 0.4);

    return isStar ? getStarLayout(nodes, edges) : getDagreLayout(nodes, edges, 'LR');
};

export type LayoutMode = 'auto' | 'hierarchical' | 'star';

export const applyLayout = (nodes: Node[], edges: Edge[], mode: LayoutMode) => {
    switch (mode) {
        case 'hierarchical':
            return getDagreLayout(nodes, edges, 'LR');
        case 'star':
            return getStarLayout(nodes, edges);
        case 'auto':
        default:
            return getSmartLayout(nodes, edges);
    }
};
