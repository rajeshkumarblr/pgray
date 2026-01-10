import React, { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
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

    // Strict dense grid layout (no Dagre):
    // - X = depth * 40
    // - Y = rowIndex * 50
    // - rowIndex increments in pre-order traversal
    const INDENT_X = 40;
    const ROW_Y = 50;
    let rowIndex = 0;

    // 2) Pre-order traversal pass (inject computed metrics into node.data)
    const traverse = (plan: PostgresPlan, parentId: string | null, depth = 0) => {
        const currentIdNum = idCounter++;
        const id = `node_${currentIdNum}`;

        const nodeLabel = plan["Node Type"];

        const metrics = metricsByPlan.get(plan as unknown as object);
        const exclusive_time = metrics?.exclusive_time ?? 0;

        const severity_score =
            maxExclusiveTime > 0 ? Math.min(1, Math.max(0, exclusive_time / maxExclusiveTime)) : 0;

        const x = depth * INDENT_X;
        const y = rowIndex * ROW_Y;
        rowIndex += 1;

        nodes.push({
            id,
            type: 'planNode', // Use our custom type
            position: { x, y },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
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

        if (parentId) {
            edges.push({
                id: `e_${parentId}_${id}`,
                source: parentId,
                target: id,
                type: 'smoothstep',
                style: { stroke: '#475569', strokeWidth: 2 },
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

interface PlanNodeData {
  id: number; // Added id
  label: string;
  cost: number;

  // Pain metrics (optional)
  exclusive_time?: number; // ms
  severity_score?: number; // 0.0 to 1.0
}

const formatMs = (ms: number) => {
  if (!Number.isFinite(ms)) return '—';
  if (ms >= 100) return `${ms.toFixed(0)}ms`;
  if (ms >= 10) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(2)}ms`;
};

const formatCost = (cost: number) => {
  if (!Number.isFinite(cost)) return '—';
  return `cost ${cost.toFixed(2)}`;
};

const PlanNode = ({ data, selected }: NodeProps<PlanNodeData>) => {
  const severity =
    typeof data.severity_score === 'number' && Number.isFinite(data.severity_score)
      ? data.severity_score
      : 0;

  const isCritical = severity > 0.8;

  const primaryMetric =
    typeof data.exclusive_time === 'number' && Number.isFinite(data.exclusive_time)
      ? formatMs(data.exclusive_time)
      : formatCost(data.cost);

  const containerStyle: React.CSSProperties = {
    // Dimensions (compact)
    minWidth: '200px',
    maxHeight: '40px',
    height: '36px',
    padding: '4px 12px',

    // Layout
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',

    // Styling (dark pill)
    background: isCritical ? '#450a0a' : '#1e293b',
    border: isCritical ? '2px solid #ef4444' : '1px solid #334155',
    borderRadius: '6px',
    color: '#f8fafc',

    // Keep it slim even with long labels
    overflow: 'hidden',
    boxSizing: 'border-box',

    // Optional selection affordance (no layout change)
    boxShadow: selected ? '0 0 0 2px rgba(56, 189, 248, 0.35)' : 'none',
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    color: '#f8fafc',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: '1 1 auto',
  };

  const metricStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 700,
    color: '#38bdf8', // sky blue
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  };

  const hiddenHandleStyle: React.CSSProperties = {
    opacity: 0,
    width: 8,
    height: 8,
    border: 'none',
    background: 'transparent',
  };

  return (
    <div style={containerStyle}>
      <Handle type="target" position={Position.Left} style={hiddenHandleStyle} />

      <div style={labelStyle} title={data.label}>
        {data.label}
      </div>

      <div style={metricStyle} title={primaryMetric}>
        {primaryMetric}
      </div>

      <Handle type="source" position={Position.Right} style={hiddenHandleStyle} />
    </div>
  );
};

export default memo(PlanNode);
