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
}

const PlanNode = ({ data, selected }: NodeProps<PlanNodeData>) => {
  const isAnalysis = data.actual_time !== undefined;

  // Simple "pgMustard-ish" look
  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px',
      border: selected ? '3px solid #2563eb' : '1px solid #777',
      backgroundColor: '#fff',
      minWidth: '150px',
      fontFamily: 'sans-serif',
      boxShadow: selected ? '0 0 0 4px rgba(37, 99, 235, 0.3), 0 10px 25px -5px rgba(0, 0, 0, 0.2)' : '2px 2px 5px rgba(0,0,0,0.1)',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.2s ease',
      zIndex: selected ? 10 : 1 // Bring selected node to front
    }}>
      <Handle type="target" position={Position.Top} />
      
      <div style={{ fontWeight: 'bold', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ 
             background: '#0f172a', color: 'white', fontWeight: 'bold', 
             borderRadius: '4px', padding: '2px 6px', fontSize: '10px'
        }}>
             #{data.id}
        </div>
        {data.label}
      </div>
      
      <div style={{ fontSize: '12px' }}>
        <div>Est. Cost: {data.cost}</div>
        <div>Est. Rows: {data.rows}</div>
        
        {isAnalysis && (
            <div style={{ marginTop: '5px', borderTop: '1px solid #eee', paddingTop: '5px' }}>
                <div style={{ color: '#006400' }}>Actual Rows: {data.actual_rows}</div>
                <div style={{ color: '#b22222' }}>Time: {data.actual_time?.toFixed(3)}ms</div>
            </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default memo(PlanNode);
