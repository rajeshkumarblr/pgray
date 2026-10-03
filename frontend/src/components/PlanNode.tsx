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
  time_pct?: number; // 0 to 100
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
  return `cost ${cost.toFixed(1)}`;
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
    window.dispatchEvent(new CustomEvent('pgray-node-contextmenu', {
      detail: { x: e.clientX, y: e.clientY, node: { id, data } }
    }));
  }, [id, data]);

  const severity =
    typeof data.severity_score === 'number' && Number.isFinite(data.severity_score)
      ? data.severity_score
      : 0;

  const hasActualTime = typeof data.exclusive_time === 'number' && data.actual_rows !== undefined;
  const exclusiveMs = data.exclusive_time || 0;

  // Never paint sub-millisecond nodes critical red; require meaningful runtime (>= 1.5ms) or high cost (>= 120)
  const isCritical = severity > 0.75 && (hasActualTime ? exclusiveMs >= 1.5 : data.cost >= 120);
  const isWarm = !isCritical && severity > 0.45 && (hasActualTime ? exclusiveMs >= 0.35 : data.cost >= 35);

  const primaryMetric =
    typeof data.exclusive_time === 'number' && Number.isFinite(data.exclusive_time)
      ? formatMs(data.exclusive_time)
      : formatCost(data.cost);

  const timePct = typeof data.time_pct === 'number' ? data.time_pct : Math.round(severity * 100);
  const rowsRemoved = data.details?.['Rows Removed by Filter'];
  const actualLoops = data.details?.['Actual Loops'] || 1;

  // Parse Relation / Alias / Index
  const relation = data.details?.['Relation Name'];
  const alias = data.details?.['Alias'];
  const indexName = data.details?.['Index Name'];
  let targetSummary = '';
  if (relation) {
    targetSummary = alias && alias !== relation ? `${relation} (${alias})` : relation;
    if (indexName) {
      targetSummary += ` • ${indexName}`;
    }
  } else if (indexName) {
    targetSummary = indexName;
  }

  // Extract inline key/condition summary (Sort Key, Hash Cond, Index Cond, Group Key, Filter)
  const rawSortKey = data.details?.['Sort Key'];
  const rawGroupKey = data.details?.['Group Key'];
  const rawHashCond = data.details?.['Hash Cond'] || data.details?.['Merge Cond'] || data.details?.['Index Cond'];
  const rawFilter = data.details?.['Filter'];

  let predicateSummary = '';
  if (Array.isArray(rawSortKey) && rawSortKey.length > 0) {
    predicateSummary = `by ${rawSortKey.join(', ')}`;
  } else if (Array.isArray(rawGroupKey) && rawGroupKey.length > 0) {
    predicateSummary = `group ${rawGroupKey.join(', ')}`;
  } else if (typeof rawHashCond === 'string') {
    predicateSummary = rawHashCond;
  } else if (typeof rawFilter === 'string') {
    predicateSummary = `filter ${rawFilter}`;
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

  // Color & Border tokens
  const borderColor = selected
    ? '#38bdf8'
    : isCritical
      ? '#ef4444'
      : isWarm
        ? '#f59e0b'
        : '#334155';

  const bgGradient = isCritical
    ? 'linear-gradient(180deg, rgba(69, 10, 10, 0.85) 0%, rgba(15, 23, 42, 0.96) 100%)'
    : isWarm
      ? 'linear-gradient(180deg, rgba(69, 26, 3, 0.65) 0%, rgba(15, 23, 42, 0.96) 100%)'
      : 'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)';

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '276px',
    minHeight: '72px',
    padding: '9px 12px 11px 12px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '4px',
    background: bgGradient,
    border: `${selected ? '1.5px' : '1px'} solid ${borderColor}`,
    borderRadius: '10px',
    color: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    fontSize: '12px',
    boxShadow: selected
      ? '0 0 0 3px rgba(56, 189, 248, 0.22), 0 8px 20px rgba(0, 0, 0, 0.4)'
      : '0 4px 12px rgba(2, 6, 23, 0.45)',
    transition: 'all 0.15s ease',
    overflow: 'hidden',
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
    left: '28px',
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

      {/* Top Row: Node ID + Operation Type + Exclusive Time + % Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          <span style={{
            background: '#090d16',
            color: '#64748b',
            border: '1px solid #1e293b',
            fontSize: '10px',
            padding: '1px 5px',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontWeight: 600,
            flexShrink: 0
          }}>
            #{data.id}
          </span>
          <span
            title={data.label}
            style={{
              fontWeight: 600,
              fontSize: '12.5px',
              color: '#f1f5f9',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em'
            }}
          >
            {data.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <span style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11.5px',
            fontWeight: 700,
            color: isCritical ? '#fca5a5' : isWarm ? '#fcd34d' : '#38bdf8'
          }}>
            {primaryMetric}
          </span>
          {timePct > 0 && (
            <span style={{
              fontSize: '9.5px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              padding: '1px 4px',
              borderRadius: '4px',
              background: isCritical ? 'rgba(239, 68, 68, 0.2)' : 'rgba(51, 65, 85, 0.6)',
              color: isCritical ? '#fca5a5' : '#94a3b8',
              fontWeight: 600
            }}>
              {timePct}%
            </span>
          )}
        </div>
      </div>

      {/* Middle Row: Relation / Index OR Key Condition */}
      {(targetSummary || predicateSummary) && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1px',
          background: 'rgba(9, 13, 22, 0.45)',
          border: '1px solid rgba(51, 65, 85, 0.4)',
          borderRadius: '5px',
          padding: '3px 6px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '10.5px',
        }}>
          {targetSummary && (
            <div
              title={targetSummary}
              style={{
                color: '#cbd5e1',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              on <span style={{ color: '#93c5fd' }}>{targetSummary}</span>
            </div>
          )}
          {predicateSummary && (
            <div
              title={predicateSummary}
              style={{
                color: '#64748b',
                fontSize: '10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {predicateSummary}
            </div>
          )}
        </div>
      )}

      {/* Diagnostic Pill Row */}
      {(hasRowSkew || hasDiskSpill || hasHeapFetches) && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {hasRowSkew && (
            <span
              title={`Planner estimated ${planRows} rows, actual was ${actualRows} rows (${Math.round(skewFactor)}x skew). Consider ANALYZE ${relation || ''}.`}
              style={{
                fontSize: '9.5px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.18)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
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
                fontSize: '9.5px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.22)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#fca5a5',
                fontWeight: 600,
              }}
            >
              Spill to Disk
            </span>
          )}
          {hasHeapFetches && (
            <span
              title={`Index Only Scan performed ${heapFetches} heap fetches due to stale visibility map. Run VACUUM.`}
              style={{
                fontSize: '9.5px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'rgba(168, 85, 247, 0.2)',
                border: '1px solid rgba(168, 85, 247, 0.45)',
                color: '#d8b4fe',
                fontWeight: 600,
              }}
            >
              {formatRows(heapFetches)} heap fetches
            </span>
          )}
        </div>
      )}

      {/* Bottom Telemetry Row: Rows Est vs Actual + Loops + Filtered */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '10px',
        color: '#94a3b8',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        marginTop: '1px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {actualRows !== undefined ? (
            <span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatRows(actualRows)}</span> rows{' '}
              <span style={{ color: '#64748b' }}>(est {formatRows(data.rows)})</span>
            </span>
          ) : (
            <span>est {formatRows(data.rows)} rows</span>
          )}
          {actualLoops > 1 && (
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>×{actualLoops}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {rowsRemoved && rowsRemoved > 0 ? (
            <span style={{ color: '#f87171' }} title={`${rowsRemoved} rows filtered out`}>
              -{formatRows(rowsRemoved)} filt
            </span>
          ) : null}
        </div>
      </div>

      {/* Bottom Time-Share Heat Bar */}
      {timePct >= 3 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '3px',
            background: 'rgba(15, 23, 42, 0.7)'
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(4, timePct))}%`,
              height: '100%',
              background: isCritical ? '#ef4444' : isWarm ? '#f59e0b' : '#38bdf8'
            }}
          />
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={sourceHandleStyle} />
    </div>
  );
};

export default memo(PlanNode);