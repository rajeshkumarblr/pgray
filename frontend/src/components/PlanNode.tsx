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
  details?: any; // Full plan JSON
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

const PlanNode = ({ id, data, selected }: NodeProps<PlanNodeData>) => {
  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Dispatch custom event to ensure context menu works even if ReactFlow swallows it
    window.dispatchEvent(new CustomEvent('pgray-node-contextmenu', {
      detail: { x: e.clientX, y: e.clientY, node: { id, data } }
    }));
  }, [id, data]);

  const severity =
    typeof data.severity_score === 'number' && Number.isFinite(data.severity_score)
      ? data.severity_score
      : 0;

  const isCritical = severity > 0.8;
  const isSeqScan = data.label.toLowerCase().includes('seq scan');

  const primaryMetric =
    typeof data.exclusive_time === 'number' && Number.isFinite(data.exclusive_time)
      ? formatMs(data.exclusive_time)
      : formatCost(data.cost);

  const rowsRemoved = data.details?.['Rows Removed by Filter'];

  const rowMetric =
    data.actual_rows !== undefined
      ? `${formatRows(data.rows)} est / ${formatRows(data.actual_rows)} act`
      : `${formatRows(data.rows)} est`;

  // Parse Relation / Alias
  const relation = data.details?.['Relation Name'];
  const alias = data.details?.['Alias'];
  // If alias exists and is different from relation, show both. Otherwise just relation.
  // If no relation, maybe show nothing.
  let tableLabel = '';
  if (relation) {
    if (alias && alias !== relation) {
      tableLabel = `${relation} (${alias})`;
    } else {
      tableLabel = relation;
    }
  }

  // --- STYLES ---

  // Main Container: Slim Dark Pill
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    minWidth: '240px', // Slightly wider to accommodate extra info
    minHeight: '60px', // Taller for relation name
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    backgroundColor: isCritical
      ? (isSeqScan ? '#451a1a' : '#450a0a') // Milder Red for Seq Scan, Deep Red for others
      : '#1e293b',
    border: isCritical
      ? (isSeqScan ? '2px solid #ef5350' : '2px solid #ef4444') // Milder/Lighter Red border for Seq Scan
      : selected ? '2px solid #38bdf8' : '1px solid #475569',
    borderRadius: '8px',
    color: '#f8fafc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    boxShadow: selected ? '0 0 0 2px rgba(56, 189, 248, 0.2)' : 'none',
    transition: 'all 0.15s ease',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: tableLabel ? '2px' : '4px',
  };

  const idBadgeStyle: React.CSSProperties = {
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '4px',
    marginRight: '6px',
    fontWeight: 'bold',
    flexShrink: 0
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '120px',
    flex: 1
  };

  const metricStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#38bdf8',
    whiteSpace: 'nowrap',
    marginLeft: '8px'
  };

  const relationStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#cbd5e1', // Lighter than sub-metric
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontStyle: 'italic'
  };

  const subMetricStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#94a3b8',
    width: '100%',
    textAlign: 'right',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px'
  };

  const discardedStyle: React.CSSProperties = {
    color: '#f87171', // Redish for discarded
  };

  // --- HANDLES ---
  const targetHandleStyle: React.CSSProperties = {
    left: 0,
    top: '50%',
    transform: 'translate(0, -50%)',
    opacity: 0,
    width: 10,
    height: 10,
    background: 'transparent',
  };

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
    <div style={containerStyle} onContextMenu={handleContextMenu}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />

      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          <div style={idBadgeStyle}>#{data.id}</div>
          <div style={labelStyle} title={data.label}>{data.label}</div>
        </div>
        <div style={metricStyle}>{primaryMetric}</div>
      </div>

      {tableLabel && (
        <div style={relationStyle} title={tableLabel}>
          {tableLabel}
        </div>
      )}

      <div style={subMetricStyle}>
        {/* Buffering Detector */}
        {(() => {
          const sharedHit = data.details?.['Shared Hit Blocks'] || 0;
          const sharedRead = data.details?.['Shared Read Blocks'] || 0;
          const totalBlocks = sharedHit + sharedRead;

          if (totalBlocks > 0) {
            const ratio = sharedHit / totalBlocks;
            if (ratio < 0.99) {
              return (
                <div style={{ color: '#facc15', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '4px' }} title={`Cache Hit Ratio: ${(ratio * 100).toFixed(1)}%. Reading from disk!`}>
                  <span>⚠</span>
                  <span>{(ratio * 100).toFixed(0)}% cache</span>
                </div>
              );
            }
          }
          return null;
        })()}

        <div>{rowMetric}</div>
        {rowsRemoved && rowsRemoved > 0 && (
          <div style={discardedStyle}>
            • {formatRows(rowsRemoved)} disc
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={sourceHandleStyle} />
    </div>
  );
};

export default memo(PlanNode);