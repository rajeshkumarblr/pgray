import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

// Invisible junction used to build explorer-style tree connectors:
// - vertical spine (top/bottom handles)
// - horizontal taps (left/right handles)
const JunctionNode = (_props: NodeProps) => {
  return (
    <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}>
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />

      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0 }} />
    </div>
  );
};

export default memo(JunctionNode);
