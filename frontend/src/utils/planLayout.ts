import { Node, Edge } from 'reactflow';

// Define the Postgres Plan Type broadly
interface PostgresPlan {
    "Node Type": string;
    "Total Cost": number;
    "Plan Rows": number;
    "Actual Rows"?: number;
    "Actual Total Time"?: number;
    "Plans"?: PostgresPlan[];
    [key: string]: any;
}

type PlanMetrics = {
    base_time: number;        // Actual Total Time if present; otherwise Total Cost
    exclusive_time: number;   // base_time - sum(immediate children base_time), clamped to 0
};

const getPlanBaseTime = (plan: PostgresPlan): number => {
    const actual = plan["Actual Total Time"];
    if (typeof actual === 'number' && Number.isFinite(actual)) return actual;

    const cost = plan["Total Cost"];
    if (typeof cost === 'number' && Number.isFinite(cost)) return cost;

    return 0;
};

/**
 * Analyze the plan tree BEFORE generating ReactFlow nodes:
 * - computes exclusive time per node
 * - finds max exclusive time across the tree
 */
const analyzePlanTree = (rootPlan: PostgresPlan) => {
    const metricsByPlan = new WeakMap<object, PlanMetrics>();
    let maxExclusiveTime = 0;

    const postOrder = (plan: PostgresPlan): PlanMetrics => {
        const base_time = getPlanBaseTime(plan);

        let childrenBaseSum = 0;
        if (plan.Plans && Array.isArray(plan.Plans)) {
            for (const child of plan.Plans) {
                const childMetrics = postOrder(child);
                childrenBaseSum += childMetrics.base_time; // immediate children only
            }
        }

        const exclusive_time = Math.max(0, base_time - childrenBaseSum);
        maxExclusiveTime = Math.max(maxExclusiveTime, exclusive_time);

        const m: PlanMetrics = { base_time, exclusive_time };
        metricsByPlan.set(plan as unknown as object, m);
        return m;
    };

    postOrder(rootPlan);

    return { metricsByPlan, maxExclusiveTime };
};

export const parsePlanToFlow = (explainJson: any): { nodes: Node[]; edges: Edge[] } => {
    // If the input is the full Explain result (array wrapping the plan), extract the Plan
    // Usually Explain FORMAT JSON returns [ { "Plan": { ... } } ]
    let rootPlan: PostgresPlan | null = null;

    if (Array.isArray(explainJson) && explainJson.length > 0 && explainJson[0].Plan) {
        rootPlan = explainJson[0].Plan;
    } else if (explainJson && explainJson.Plan) {
        rootPlan = explainJson.Plan;
    } else {
        // Fallback or maybe it's already the plan object?
        rootPlan = explainJson;
    }

    if (!rootPlan) return { nodes: [], edges: [] };

    // 1) Analysis pass (exclusive time + max exclusive time)
    const { metricsByPlan, maxExclusiveTime } = analyzePlanTree(rootPlan);

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let idCounter = 0;

    // Indented tree layout (pgMustard-like):
    // - root at top-left
    // - children below with increasing indent per depth
    // Tuned for compact, pgMustard-like outline readability
    const X_GAP = 220;
    const Y_GAP = 96;
    const SPINE_OFFSET_X = 36; // spine sits slightly left of node cards
    const NODE_CENTER_Y = 26;  // approx midline of compact node card

    const connectorStroke = { stroke: '#94a3b8', strokeWidth: 1 };
    let row = 0;

    // 2) Existing traversal pass (inject computed metrics into node.data)
    // We build an explorer-like connector network:
    // - each plan node gets a junction point to its left (same Y)
    // - for nodes with children, parent connects to first child, and siblings form a vertical spine
    const traverse = (plan: PostgresPlan, depth = 0): string => {
        const currentIdNum = idCounter++;
        const id = `node_${currentIdNum}`;

        const nodeLabel = plan["Node Type"];

        const metrics = metricsByPlan.get(plan as unknown as object);
        const exclusive_time = metrics?.exclusive_time ?? 0;

        const severity_score =
            maxExclusiveTime > 0 ? Math.min(1, Math.max(0, exclusive_time / maxExclusiveTime)) : 0;

        const y = row * Y_GAP;
        const x = depth * X_GAP;
        const junctionId = `j_${id}`;

        // Junction node used purely for connector routing.
        nodes.push({
            id: junctionId,
            type: 'junction',
            position: { x: x - SPINE_OFFSET_X, y: y + NODE_CENTER_Y },
            data: {},
            selectable: false,
            draggable: false,
            deletable: false,
        });

        // Horizontal tap from spine junction into the actual plan node.
        edges.push({
            id: `tap_${junctionId}_${id}`,
            source: junctionId,
            target: id,
            sourceHandle: 'right',
            type: 'straight',
            style: connectorStroke,
        });

        nodes.push({
            id,
            type: 'planNode', // Use our custom type
            position: { x, y },
            data: {
                id: currentIdNum, // Pass the numeric ID
                label: nodeLabel,
                cost: plan["Total Cost"],
                rows: plan["Plan Rows"],
                actual_rows: plan["Actual Rows"],
                actual_time: plan["Actual Total Time"],
                details: plan,

                // Heatmap metrics
                exclusive_time,
                max_time: maxExclusiveTime,
                severity_score,
            },
        });

        row += 1;

        if (plan.Plans && Array.isArray(plan.Plans) && plan.Plans.length > 0) {
            const childJunctions = plan.Plans.map((child) => traverse(child, depth + 1));

            // Connect parent to first child (the spine continues from there).
            edges.push({
                id: `branch_${junctionId}_${childJunctions[0]}`,
                source: junctionId,
                target: childJunctions[0],
                sourceHandle: 'right',
                targetHandle: 'left',
                type: 'step',
                style: connectorStroke,
            });

            // Vertical spine through sibling child junctions.
            for (let i = 0; i < childJunctions.length - 1; i += 1) {
                edges.push({
                    id: `spine_${childJunctions[i]}_${childJunctions[i + 1]}`,
                    source: childJunctions[i],
                    target: childJunctions[i + 1],
                    sourceHandle: 'bottom',
                    targetHandle: 'top',
                    type: 'straight',
                    style: connectorStroke,
                });
            }
        }

        return junctionId;
    };

    traverse(rootPlan);
    return { nodes, edges };
};
