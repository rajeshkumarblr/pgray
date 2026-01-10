import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background, Controls, Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import 'reactflow/dist/style.css';
import ConnectionModal from './components/ConnectionModal';
import PlanNode from './components/PlanNode';
import { connectDb, explainQuery, getHistory } from './api';
import { parsePlanToFlow } from './utils/planLayout';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import NodeDetailsPanel from './components/NodeDetailsPanel';
import HistoryModal from './components/HistoryModal';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [explainResult, setExplainResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null); // To handle fitting view

  // Pain Mode toggle (Step 3)
  const [isPainMode, setIsPainMode] = useState(true);

  // Prefill editor with the last saved query (if editor is empty)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getHistory();
        const lastQuery = data?.history?.[0]?.query;
        if (!cancelled && typeof lastQuery === 'string' && lastQuery.trim()) {
          setSqlQuery((prev) => (prev.trim() ? prev : lastQuery));
        }
      } catch {
        // Ignore (backend may not be up yet)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ReactFlow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const nodeTypes = useMemo(() => ({ planNode: PlanNode }), []);

  // Critical: propagate pain_mode into node.data so ReactFlow rerenders custom nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...(node.data as any), pain_mode: isPainMode },
      })),
    );
  }, [isPainMode]);

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

      // Initial load: ensure nodes start with current Pain Mode value
      const nodesWithPainMode = layoutNodes.map((node) => ({
        ...node,
        data: { ...(node.data as any), pain_mode: isPainMode },
      }));

      setNodes(nodesWithPainMode);
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
         onHistory={() => setIsHistoryOpen(true)}
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
                {/* Pain Mode Toggle Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    zIndex: 10,
                    background: '#ffffff',
                    borderRadius: '10px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25)',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    border: '1px solid #e2e8f0',
                    userSelect: 'none',
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>
                    🔥 Pain Mode
                  </div>

                  <label
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      width: '44px',
                      height: '24px',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isPainMode}
                      onChange={(e) => setIsPainMode(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: isPainMode ? '#ef4444' : '#cbd5e1',
                        borderRadius: '999px',
                        transition: 'background-color 0.2s ease',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        height: '18px',
                        width: '18px',
                        left: isPainMode ? '22px' : '3px',
                        top: '3px',
                        backgroundColor: '#ffffff',
                        borderRadius: '999px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                        transition: 'left 0.2s ease',
                      }}
                    />
                  </label>
                </div>

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

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectQuery={(query) => {
            setSqlQuery(query);
            // Optionally clear current plan? Maybe keep it until they hit Explain.
        }}
      />
    </div>
  )
}

export default App
