import { useState, useMemo } from 'react'
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import ConnectionModal from './components/ConnectionModal';
import PlanNode from './components/PlanNode';
import { connectDb, explainQuery } from './api';
import { parsePlanToFlow } from './utils/planLayout';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [explainResult, setExplainResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // ReactFlow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const nodeTypes = useMemo(() => ({ planNode: PlanNode }), []);
  
  const handleConnectionDecode = async (info: any) => {
      try {
        setLoading(true);
        setError('');
        await connectDb(info);
        setConnectionInfo(info);
        setIsModalOpen(false);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.detail || 'Connection failed');
      } finally {
        setLoading(false);
      }
  };

  const handleRunExplain = async () => {
    if (!connectionInfo || !sqlQuery) return;
    try {
      setLoading(true);
      setError('');
      const data = await explainQuery(connectionInfo, sqlQuery);
      
      // Parse layout
      const layout = parsePlanToFlow(data); // data is { status: "success", plan: ... }
      // Wait, api returns data.plan from execute_explain which returns JSON. 
      // Ensure we pass the right object. 
      // Backend: return {"status": "success", "plan": plan}
      // api.ts: return response.data;
      // So data.plan is the Plan Array or Object. 
      
      const { nodes: layoutNodes, edges: layoutEdges } = parsePlanToFlow(data.plan);
      setNodes(layoutNodes);
      setEdges(layoutEdges);
      setExplainResult(JSON.stringify(data.plan, null, 2));
      
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Explain failed');
    } finally {
      setLoading(false);
    }
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 10,
    top: 50,
    left: 10,
    background: 'white',
    padding: '10px',
    borderRadius: '8px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '300px'
  };

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <button onClick={() => setIsModalOpen(true)} style={{ position: 'absolute', zIndex: 10, top: 10, left: 10 }}>
        {connectionInfo ? `Connected to ${connectionInfo.host}` : 'Open Connection'}
      </button>

      {connectionInfo && (
        <div style={panelStyle}>
          <textarea 
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            placeholder="Enter SQL Query..."
            rows={5}
            style={{ width: '100%', padding: '5px' }}
          />
          <button onClick={handleRunExplain} disabled={loading}>
            {loading ? 'Running...' : 'Run Explain'}
          </button>
          
          <button onClick={() => { setNodes([]); setEdges([]); setExplainResult(null); }} disabled={nodes.length === 0}>
             Clear Visualization
          </button>
          
          {error && <div style={{ color: 'red', fontSize: '12px' }}>{error}</div>}

          {explainResult && (
            <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px', flex: 1, overflow: 'auto', maxHeight: '500px' }}>
              <strong style={{ fontSize: '12px' }}>Raw Plan:</strong>
              <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '5px', borderRadius: '4px' }}>
                {explainResult}
              </pre>
            </div>
          )}
        </div>
      )}
      
      {/* We removed the right-side JSON panel to focus on the Visual Tree */}

      <ConnectionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleConnectionDecode}
      />
      
      <ReactFlow 
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
             // Basic state update for dragging nodes
             // For production, look at useNodesState
        }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

export default App
