import dagre from 'dagre';
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

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let idCounter = 0;

    const traverse = (plan: PostgresPlan, parentId: string | null = null) => {
        const id = `node_${idCounter++}`;
        
        // Construct Node Data
        const nodeLabel = plan["Node Type"];
        
        nodes.push({
            id,
            type: 'planNode', // Use our custom type
            position: { x: 0, y: 0 }, // Dagre will set this
            data: { 
                label: nodeLabel,
                cost: plan["Total Cost"],
                rows: plan["Plan Rows"],
                actual_rows: plan["Actual Rows"],
                actual_time: plan["Actual Total Time"],
                details: plan
            },
        });

        if (parentId) {
            edges.push({
                id: `e_${parentId}-${id}`,
                source: parentId,
                target: id,
                type: 'smoothstep', // nice curved edges
            });
        }

        if (plan.Plans && Array.isArray(plan.Plans)) {
            plan.Plans.forEach(child => traverse(child, id));
        }
    };

    traverse(rootPlan);
    return getLayoutedElements(nodes, edges);
};

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Set graph direction
    dagreGraph.setGraph({ rankdir: 'TB' }); // Top to Bottom

    nodes.forEach((node) => {
        // Estimated node size. Ideally, check generic PlanNode size
        dagreGraph.setNode(node.id, { width: 180, height: 100 }); 
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.position = {
            x: nodeWithPosition.x - nodeWithPosition.width / 2,
            y: nodeWithPosition.y - nodeWithPosition.height / 2,
        };
    });

    return { nodes, edges };
};
