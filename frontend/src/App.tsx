import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background, Controls, Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import 'reactflow/dist/style.css';
import ConnectionModal from './components/ConnectionModal';
import PlanNode from './components/PlanNode';
import { connectDb, explainQuery, executeQuery, getHistory } from './api';
import ResultsTable from './components/ResultsTable';
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
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'results'>('plan');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null); // To handle fitting view

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

  const handleConnectionDecode = async (info: any) => {
    try {
      setLoading(true);
      setError('');
      await connectDb(info);
      setConnectionInfo(info);
      localStorage.setItem('pgray_connection', JSON.stringify(info));
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  /* Sidebar Logic */
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleRunExplain = async (analyze: boolean, getResults: boolean) => {
    if (!connectionInfo || !sqlQuery) return;
    try {
      setLoading(true);
      setError('');
      // Clear previous
      setNodes([]); setEdges([]); setSelectedNode(null); setExplainResult(null); setExecutionResult(null);

      // 1. Run Explain (always)
      const response = await explainQuery(connectionInfo, sqlQuery, analyze);
      const { json } = response.data;
      const { nodes: layoutNodes, edges: layoutEdges } = parsePlanToFlow(json);

      setNodes(layoutNodes);
      setEdges(layoutEdges);
      setExplainResult(json);
      setActiveTab('plan'); // Show plan by default

      // 2. Fetch Results if requested
      if (getResults) {
        try {
          const execResponse = await executeQuery(connectionInfo, sqlQuery, 100);
          setExecutionResult(execResponse.data);
        } catch (execErr: any) {
          console.error("Execution failed", execErr);
          setError(`Explain successful, but execution failed: ${execErr.response?.data?.detail || execErr.message}`);
        }
      }

      // Auto-collapse sidebar on success
      setIsSidebarCollapsed(true);

      // Fit view after a tick
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

  const handleVisualizeJson = (jsonStr: string) => {
    try {
      setLoading(true);
      setError('');
      setNodes([]); setEdges([]); setSelectedNode(null); setExplainResult(null); setExecutionResult(null);

      const json = JSON.parse(jsonStr);
      // Support both array wrapped or single object
      const planData = Array.isArray(json) ? json : [json];

      const { nodes: layoutNodes, edges: layoutEdges } = parsePlanToFlow(planData);

      setNodes(layoutNodes);
      setEdges(layoutEdges);
      setExplainResult(planData);
      setActiveTab('plan');

      setIsSidebarCollapsed(true);

      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2 });
        }
      }, 50);

    } catch (err: any) {
      console.error(err);
      setError("Invalid JSON Plan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const onNodeClick = useCallback((_event: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const totalTime = explainResult && explainResult[0] && explainResult[0]['Execution Time'];

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  // Re-center graph when side panel toggles
  useEffect(() => {
    if (reactFlowInstance) {
      const timer = setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [!!selectedNode, reactFlowInstance, isSidebarCollapsed]);

  // Auto-connect from local storage
  useEffect(() => {
    const saved = localStorage.getItem('pgray_connection');
    if (saved) {
      try {
        const info = JSON.parse(saved);
        handleConnectionDecode(info);
      } catch (e) {
        console.error("Failed to parse saved connection", e);
      }
    }
  }, []); // Run once on mount

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        onNewPlan={() => {
          setSelectedNode(null);
          setNodes(nds => nds.map(node => ({ ...node, selected: false })));
          setIsSidebarCollapsed(false);
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
          onVisualizeJson={handleVisualizeJson}
          loading={loading}
          explainResult={explainResult}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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


          {/* Tabs Header */}
          <div style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #475569' }}>
            <div
              onClick={() => setActiveTab('plan')}
              style={{
                padding: '10px 20px',
                cursor: 'pointer',
                color: activeTab === 'plan' ? '#e2e8f0' : '#64748b',
                borderBottom: activeTab === 'plan' ? '2px solid #3b82f6' : 'none',
                fontWeight: activeTab === 'plan' ? 600 : 500
              }}
            >
              Explain Plan
            </div>
            <div
              onClick={() => setActiveTab('results')}
              style={{
                padding: '10px 20px',
                cursor: 'pointer',
                color: activeTab === 'results' ? '#e2e8f0' : '#64748b',
                borderBottom: activeTab === 'results' ? '2px solid #3b82f6' : 'none',
                fontWeight: activeTab === 'results' ? 600 : 500
              }}
            >
              Query Results
            </div>
          </div>

          {/* Conditional Content */}
          {activeTab === 'plan' ? (
            <>
              <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
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
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#475569" gap={20} />
                  <Controls />
                </ReactFlow>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, overflow: 'hidden', background: '#1e293b' }}>
              {executionResult ? (
                <ResultsTable data={executionResult} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b' }}>
                  <div>Run the query to see results here.</div>
                </div>
              )}
            </div>
          )}
        </div>

        <NodeDetailsPanel
          selectedNode={selectedNode}
          onClose={() => {
            setSelectedNode(null);
            setNodes(nds => nds.map(node => ({ ...node, selected: false })));
          }}
          fullPlan={explainResult}
        />
      </div>

      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleConnectionDecode}
        initialInfo={connectionInfo}
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
