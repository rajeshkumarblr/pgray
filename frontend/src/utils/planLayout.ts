import { Node, Edge, Position } from 'reactflow';

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
    base_time: number;
    exclusive_time: number;
};

const getPlanBaseTime = (plan: PostgresPlan): number => {
    const actual = plan["Actual Total Time"];
    if (typeof actual === 'number' && Number.isFinite(actual)) return actual;

    const cost = plan["Total Cost"];
    if (typeof cost === 'number' && Number.isFinite(cost)) return cost;

    return 0;
};

const analyzePlanTree = (rootPlan: PostgresPlan) => {
    const metricsByPlan = new WeakMap<object, PlanMetrics>();
    let maxExclusiveTime = 0;

    const postOrder = (plan: PostgresPlan): PlanMetrics => {
        const base_time = getPlanBaseTime(plan);

        let childrenBaseSum = 0;
        if (plan.Plans && Array.isArray(plan.Plans)) {
            for (const child of plan.Plans) {
                const childMetrics = postOrder(child);
                childrenBaseSum += childMetrics.base_time; 
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
    let rootPlan: PostgresPlan | null = null;

    if (Array.isArray(explainJson) && explainJson.length > 0 && explainJson[0].Plan) {
        rootPlan = explainJson[0].Plan;
    } else if (explainJson && explainJson.Plan) {
        rootPlan = explainJson.Plan;
    } else {
        rootPlan = explainJson;
    }

    if (!rootPlan) return { nodes: [], edges: [] };

    // 1) Analysis pass
    const { metricsByPlan, maxExclusiveTime } = analyzePlanTree(rootPlan);

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let idCounter = 0;

    // --- GRID LAYOUT CONSTANTS ---
    // INDENT_X: Horizontal indentation per depth level
    const INDENT_X = 40; 
    // ROW_Y: Vertical space per node row (36px node + 14px gap = 50px)
    const ROW_Y = 50; 
    let rowIndex = 0;

    const traverse = (plan: PostgresPlan, parentId: string | null, depth = 0) => {
        const currentIdNum = idCounter++;
        const id = `node_${currentIdNum}`;
        const nodeLabel = plan["Node Type"];

        const metrics = metricsByPlan.get(plan as unknown as object);
        const exclusive_time = metrics?.exclusive_time ?? 0;
        const severity_score = maxExclusiveTime > 0 
            ? Math.min(1, Math.max(0, exclusive_time / maxExclusiveTime)) 
            : 0;

        // Calculate Position on Grid
        const x = depth * INDENT_X;
        const y = rowIndex * ROW_Y;
        rowIndex += 1; // Increment row for the next node (Pre-order traversal)

        nodes.push({
            id,
            type: 'planNode',
            position: { x, y },
            // CRITICAL: Tells React Flow where to anchor edges for this specific node
            sourcePosition: Position.Bottom,
            targetPosition: Position.Left,
            data: {
                id: currentIdNum,
                label: nodeLabel,
                cost: plan["Total Cost"],
                rows: plan["Plan Rows"],
                actual_rows: plan["Actual Rows"],
                actual_time: plan["Actual Total Time"],
                details: plan,
                exclusive_time,
                max_time: maxExclusiveTime,
                severity_score,
            },
        });

        if (parentId) {
            edges.push({
                id: `e_${parentId}_${id}`,
                source: parentId,
                target: id,
                // 'smoothstep' creates nice rounded orthogonal lines
                type: 'smoothstep', 
                style: { 
                    stroke: '#64748b', // Slate-500
                    strokeWidth: 2 
                },
            });
        }

        if (plan.Plans && Array.isArray(plan.Plans)) {
            for (const child of plan.Plans) {
                traverse(child, id, depth + 1);
            }
        }
    };

    traverse(rootPlan, null, 0);
    return { nodes, edges };
};