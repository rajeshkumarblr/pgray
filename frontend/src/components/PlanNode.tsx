import React, { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';

interface PlanNodeData {
  id: number;
  label: string;
  cost: number;
  rows: number; // Plan Rows
  actual_rows?: number; // Actual Rows
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

const formatRows = (rows: number | undefined) => {
  if (rows === undefined || !Number.isFinite(rows)) return '-';
  if (rows >= 1000000) return `${(rows / 1000000).toFixed(1)}M`;
  if (rows >= 1000) return `${(rows / 1000).toFixed(1)}k`;
  return rows.toString();
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

  const rowMetric =
    data.actual_rows !== undefined
      ? `rows: ${formatRows(data.rows)} est / ${formatRows(data.actual_rows)} act`
      : `rows: ${formatRows(data.rows)} est`;

  // --- STYLES ---

  // Main Container: Slim Dark Pill
  const containerStyle: React.CSSProperties = {
    position: 'relative', // Critical for absolute handle positioning
    minWidth: '220px',
    height: '52px', // Increased height for 2 lines
    padding: '0 12px',
    display: 'flex',
    flexDirection: 'column', // Changed to column for stacking
    justifyContent: 'center',
    backgroundColor: isCritical ? '#450a0a' : '#1e293b', // Dark Red or Dark Slate
    border: isCritical ? '2px solid #ef4444' : selected ? '2px solid #38bdf8' : '1px solid #475569',
    borderRadius: '8px',
    color: '#f8fafc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    boxShadow: selected ? '0 0 0 2px rgba(56, 189, 248, 0.2)' : 'none',
    transition: 'all 0.15s ease',
  };

  const topRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: '2px',
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    marginRight: '8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '140px',
  };

  const metricStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#38bdf8', // Sky blue for metrics
    whiteSpace: 'nowrap',
  };

  const subMetricStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#94a3b8', // Slate-400
    width: '100%',
    textAlign: 'right',
  };

  // --- HANDLES (Invisible but functional) ---

  const targetHandleStyle: React.CSSProperties = {
    left: 0,
    top: '50%',
    transform: 'translate(0, -50%)',
    opacity: 0,
    width: 10,
    height: 10,
    background: 'transparent',
  };

  // SOURCE is now at the BOTTOM
  const sourceHandleStyle: React.CSSProperties = {
    left: '5%',
    bottom: 0,
    transform: 'translate(0, 0)',
    opacity: 0,
    width: 10,
    height: 10,
    background: 'transparent',
  };

  return (
    <div style={containerStyle}>
      {/* Input: From Left */}
      <Handle
        type="target"
        position={Position.Left}
        style={targetHandleStyle}
      />

      <div style={topRowStyle}>
        <div style={labelStyle} title={data.label}>
          {data.label}
        </div>
        <div style={metricStyle}>
          {primaryMetric}
        </div>
      </div>

      <div style={subMetricStyle}>
        {rowMetric}
      </div>

      {/* Output: To Bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={sourceHandleStyle}
      />
    </div>
  );
};

export default memo(PlanNode);