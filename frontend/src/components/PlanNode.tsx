import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

// We'll define the node data format
interface PlanNodeData {
  id: number; // Added id
  label: string;
  cost: number;
  rows: number;
  actual_rows?: number;
  actual_time?: number;
  details?: any;

  // Heatmap metrics (optional)
  severity_score?: number; // 0.0 to 1.0
  exclusive_time?: number; // ms
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mixHex = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A.r, B.r, t), lerp(A.g, B.g, t), lerp(A.b, B.b, t));
};

const darkenHex = (hex: string, amount = 0.18) => {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - Math.max(0, Math.min(1, amount));
  return rgbToHex(r * f, g * f, b * f);
};

// Heatmap helper
const getSeverityColor = (score?: number) => {
  const s = clamp01(typeof score === 'number' && Number.isFinite(score) ? score : 0);

  // Anchors:
  // 0.0  -> neutral/green
  // 0.5  -> yellow/orange
  // 1.0  -> red
  const green = '#ecfdf5';
  const yellow = '#fffbeb';
  const red = '#fef2f2';

  if (s < 0.1) return green;
  if (s < 0.5) return mixHex(green, yellow, (s - 0.1) / (0.5 - 0.1));
  return mixHex(yellow, red, (s - 0.5) / (1.0 - 0.5));
};

const PlanNode = ({ data, selected }: NodeProps<PlanNodeData>) => {
  const hasActual = data.actual_time !== undefined || data.actual_rows !== undefined;

  const severity = clamp01(
    typeof data.severity_score === 'number' && Number.isFinite(data.severity_score)
      ? data.severity_score
      : 0,
  );
  const isBottleneck = severity === 1;

  // Base style: keep existing white styling + blue selection behavior
  const baseStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: '6px',
    border: selected ? '3px solid #2563eb' : '1px solid #777',
    backgroundColor: '#fff',
    minWidth: '190px',
    fontFamily: 'sans-serif',
    boxShadow: selected
      ? '0 0 0 4px rgba(37, 99, 235, 0.3), 0 10px 25px -5px rgba(0, 0, 0, 0.2)'
      : '2px 2px 5px rgba(0,0,0,0.1)',
    transform: selected ? 'scale(1.03)' : 'scale(1)',
    transition: 'all 0.2s ease',
    zIndex: selected ? 10 : 1,
  };

  // Heatmap styling (always enabled)
  const heatBg = getSeverityColor(severity);
  const heatBorder = darkenHex(heatBg, 0.22);
  const nodeStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: heatBg,
    border: selected ? baseStyle.border : isBottleneck ? '4px solid #dc2626' : `1px solid ${heatBorder}`,
    boxShadow: selected
      ? baseStyle.boxShadow
      : isBottleneck
        ? '0 0 0 4px rgba(220, 38, 38, 0.25), 0 10px 25px -5px rgba(0, 0, 0, 0.25)'
        : baseStyle.boxShadow,
  };

  const actualRows = typeof data.actual_rows === 'number' ? data.actual_rows : undefined;
  const planRows = typeof data.rows === 'number' ? data.rows : undefined;
  const exclMs = typeof data.exclusive_time === 'number' ? data.exclusive_time : undefined;
  const totalMs = typeof data.actual_time === 'number' ? data.actual_time : undefined;
  const cost = typeof data.cost === 'number' ? data.cost : undefined;

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} />
      
      <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            background: '#0f172a',
            color: 'white',
            fontWeight: 700,
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '10px',
            lineHeight: 1.1,
            flexShrink: 0,
          }}
        >
          #{data.id}
        </div>
        <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.15 }}>{data.label}</div>
      </div>

      <div style={{ fontSize: '11px', color: '#334155', lineHeight: 1.25 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>
            Node: {exclMs !== undefined ? `${exclMs.toFixed(3)}ms` : '—'}
          </div>
          <div style={{ color: '#475569' }}>
            Rows: {actualRows !== undefined ? actualRows : planRows ?? '—'}
          </div>
        </div>

        <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'space-between', gap: '10px', color: '#64748b' }}>
          <div>
            Est: {cost !== undefined ? `cost ${cost.toFixed(2)}` : '—'}
          </div>
          <div>
            Est rows: {planRows !== undefined ? planRows : '—'}
          </div>
        </div>

        {hasActual && (
          <div style={{ marginTop: '4px', borderTop: `1px solid ${heatBorder}`, paddingTop: '4px', color: '#b22222' }}>
            Total: {totalMs !== undefined ? `${totalMs.toFixed(3)}ms` : '—'}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(PlanNode);
