import React, { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';

// We'll define the node data format
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
