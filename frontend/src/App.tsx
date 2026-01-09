import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background, Controls, Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import 'reactflow/dist/style.css';
import ConnectionModal from './components/ConnectionModal';
import PlanNode from './components/PlanNode';
import { connectDb, explainQuery } from './api';
import { parsePlanToFlow } from './utils/planLayout';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import NodeDetailsPanel from './components/NodeDetailsPanel';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [explainResult, setExplainResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null); // To handle fitting view
  
  // ReactFlow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

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
      // Clear previous
      setNodes([]); setEdges([]); setSelectedNode(null); setExplainResult(null);

      const data = await explainQuery(connectionInfo, sqlQuery);
      
      // data.plan is the Plan
      const { nodes: layoutNodes, edges: layoutEdges } = parsePlanToFlow(data.plan);
      setNodes(layoutNodes);
      setEdges(layoutEdges);
      setExplainResult(data.plan);

      // Fit view after a tick to allow rendering
      setTimeout(() => {
          if (reactFlowInstance) {
              reactFlowInstance.fitView({ padding: 0.2 });
          }
      }, 50);
      
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Explain failed');
    } finally {
      setLoading(false);
    }
  };

  const onNodeClick = useCallback((event: any, node: Node) => {
      setSelectedNode(node);
  }, []);

  const totalTime = explainResult && explainResult[0] && explainResult[0]['Execution Time'];

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  // Re-center graph when side panel toggles (opens/closes) to keep nodes visible
  useEffect(() => {
    if (reactFlowInstance) {
        // Delay ensures the flex layout has resized the container before we fit view
        const timer = setTimeout(() => {
            reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [!!selectedNode, reactFlowInstance]);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header 
         onNewPlan={() => { 
             setSelectedNode(null); 
             // Also clear visual selection
             setNodes(nds => nds.map(node => ({ ...node, selected: false })));
         }} 
         onHistory={() => alert("History not implemented yet")}
         onConnect={() => setIsModalOpen(true)}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Sidebar 
             connectionInfo={connectionInfo}
             sqlQuery={sqlQuery} 
             setSqlQuery={setSqlQuery}
             onRunExplain={handleRunExplain}
             loading={loading}
             explainResult={explainResult}
          />
          
          <div style={{ flex: 1, position: 'relative', background: '#334155', display: 'flex', flexDirection: 'column' }}>
             {/* Main Content Area */}
             
             {/* Total Time Display */}
             {totalTime && (
                 <div style={{ padding: '20px', zIndex: 5, color: 'white', borderBottom: '1px solid #475569' }}>
                     <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Total time: {totalTime}ms</h3>
                 </div>
             )}
             
             {error && (
                 <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fee2e2', color: '#b91c1c', padding: '20px', borderRadius: '8px', zIndex: 10 }}>
                     Error: {error}
                 </div>
             )}

             <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow 
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodeClick={onNodeClick}
                    onNodesChange={onNodesChange}
                    onPaneClick={() => setSelectedNode(null)}
                    fitView
                    onInit={setReactFlowInstance}
                    style={{ background: '#334155' }}
                >
                    <Background color="#475569" gap={20} />
                    <Controls />
                </ReactFlow>
             </div>
          </div>

          <NodeDetailsPanel 
              selectedNode={selectedNode} 
              onClose={() => {
                 setSelectedNode(null);
                 setNodes(nds => nds.map(node => ({ ...node, selected: false })));
              }} 
          />
      </div>

      <ConnectionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleConnectionDecode}
      />
    </div>
  )
}

export default App
