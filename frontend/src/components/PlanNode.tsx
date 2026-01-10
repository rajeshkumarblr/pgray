import React, { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';

interface PlanNodeData {
  id: number;
  label: string;
  cost: number;
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

  // --- STYLES ---

  // Main Container: Slim Dark Pill
  const containerStyle: React.CSSProperties = {
    position: 'relative', // Critical for absolute handle positioning
    minWidth: '200px',
    height: '36px',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isCritical ? '#450a0a' : '#1e293b', // Dark Red or Dark Slate
    border: isCritical ? '2px solid #ef4444' : selected ? '2px solid #38bdf8' : '1px solid #475569',
    borderRadius: '6px', // Slightly rounded for a technical look
    color: '#f8fafc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    boxShadow: selected ? '0 0 0 2px rgba(56, 189, 248, 0.2)' : 'none',
    transition: 'all 0.15s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    marginRight: '12px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const metricStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#38bdf8', // Sky blue for metrics
    whiteSpace: 'nowrap',
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

      <div style={labelStyle} title={data.label}>
        {data.label}
      </div>

      <div style={metricStyle}>
        {primaryMetric}
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