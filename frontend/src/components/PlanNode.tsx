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
  let tableLabel = '';
  if (relation) {
    if (alias && alias !== relation) {
      tableLabel = `${relation} (${alias})`;
    } else {
      tableLabel = relation;
    }
  }

  // Diagnostic Detectors
  const planRows = typeof data.rows === 'number' ? data.rows : 0;
  const actualRows = typeof data.actual_rows === 'number' ? data.actual_rows : undefined;
  let skewFactor = 1;
  if (actualRows !== undefined) {
    const safePlan = Math.max(planRows, 1);
    const safeActual = Math.max(actualRows, 1);
    skewFactor = Math.max(safeActual / safePlan, safePlan / safeActual);
  }
  const hasRowSkew = actualRows !== undefined && skewFactor >= 5 && Math.abs((actualRows || 0) - planRows) >= 10;

  const tempWritten = data.details?.['Temp Written Blocks'] || 0;
  const sortSpaceType = data.details?.['Sort Space Type'];
  const hashBatches = data.details?.['Hash Batches'] || 1;
  const hasDiskSpill = tempWritten > 0 || sortSpaceType === 'Disk' || hashBatches > 1;

  const heapFetches = data.details?.['Heap Fetches'] || 0;
  const hasHeapFetches = data.label.toLowerCase().includes('index only scan') && heapFetches > 0;

  // --- STYLES ---

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    minWidth: '250px',
    minHeight: '64px',
    padding: '8px 12px 10px 12px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    backgroundColor: isCritical
      ? (isSeqScan ? '#3b1518' : '#3f0d12')
      : '#1e293b',
    border: isCritical
      ? (isSeqScan ? '1.5px solid #ef5350' : '1.5px solid #ef4444')
      : selected ? '2px solid #38bdf8' : '1px solid #475569',
    borderRadius: '8px',
    color: '#f8fafc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    boxShadow: selected ? '0 0 0 3px rgba(56, 189, 248, 0.25)' : '0 4px 10px rgba(0, 0, 0, 0.25)',
    transition: 'all 0.15s ease',
    overflow: 'hidden',
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
    maxWidth: '140px',
    flex: 1
  };

  const metricStyle: React.CSSProperties = {
    fontWeight: 700,
    color: isCritical ? '#fca5a5' : '#38bdf8',
    whiteSpace: 'nowrap',
    marginLeft: '8px'
  };

  const relationStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#cbd5e1',
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
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  };

  const discardedStyle: React.CSSProperties = {
    color: '#f87171',
  };

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

      {/* Diagnostic Pill Row */}
      {(hasRowSkew || hasDiskSpill || hasHeapFetches) && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
          {hasRowSkew && (
            <span
              title={`Planner estimated ${planRows} rows, actual was ${actualRows} rows (${Math.round(skewFactor)}x skew). Consider ANALYZE ${relation || ''}.`}
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                color: '#fbbf24',
                fontWeight: 600,
              }}
            >
              ⚠ {Math.round(skewFactor)}x skew
            </span>
          )}
          {hasDiskSpill && (
            <span
              title="Operation spilled to temporary disk files! Increase work_mem."
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.25)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                fontWeight: 600,
              }}
            >
              💾 Disk Spill
            </span>
          )}
          {hasHeapFetches && (
            <span
              title={`Index Only Scan performed ${heapFetches} heap fetches due to stale visibility map. Run VACUUM.`}
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(168, 85, 247, 0.2)',
                border: '1px solid rgba(168, 85, 247, 0.45)',
                color: '#d8b4fe',
                fontWeight: 600,
              }}
            >
              🧹 {formatRows(heapFetches)} heap
            </span>
          )}
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
                <div style={{ color: '#facc15', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '3px' }} title={`Cache Hit Ratio: ${(ratio * 100).toFixed(1)}%. Reading from disk!`}>
                  <span>⚠</span>
                  <span>{(ratio * 100).toFixed(0)}% cache</span>
                </div>
              );
            }
          }
          return null;
        })()}

        <div>{rowMetric}</div>
        {rowsRemoved && rowsRemoved > 0 ? (
          <div style={discardedStyle}>
            • {formatRows(rowsRemoved)} disc
          </div>
        ) : null}
      </div>

      {/* Bottom Severity / Time-share Heat Bar */}
      {severity > 0.05 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '3px',
            background: 'rgba(15, 23, 42, 0.6)'
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.round(severity * 100))}%`,
              height: '100%',
              background: isCritical ? '#ef4444' : severity > 0.4 ? '#f59e0b' : '#38bdf8'
            }}
          />
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={sourceHandleStyle} />
    </div>
  );
};

export default memo(PlanNode);