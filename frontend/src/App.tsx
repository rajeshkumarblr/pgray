import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import ConnectionModal from './components/ConnectionModal';
import PlanNode from './components/PlanNode';
import { connectDb, explainQuery, executeQuery, getHistory } from './api';
import { parsePlanToFlow } from './utils/planLayout';
import Header from './components/Header';
import HistoryModal from './components/HistoryModal';

// Tabs
import QueryEditorTab from './components/tabs/QueryEditorTab';
import QueryTuneTab from './components/tabs/QueryTuneTab';
import ServerTuneTab from './components/tabs/ServerTuneTab';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState(() => {
    return localStorage.getItem('pgray_sql_query') || '';
  });
  const [explainResult, setExplainResult] = useState<any>(null);

  // Persist SQL Query
  useEffect(() => {
    localStorage.setItem('pgray_sql_query', sqlQuery);
  }, [sqlQuery]);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [tuneActiveSubTab, setTuneActiveSubTab] = useState<'plan' | 'results'>('plan');

  // App State
  const [activeAppTab, setActiveAppTab] = useState<'editor' | 'tune' | 'server'>('editor');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null); // To handle fitting view

  const flowWrapperRef = useRef<HTMLDivElement>(null);

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

  /* Sidebar Logic - Removed */

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const handleRunExplain = async (analyze: boolean, getResults: boolean) => {
    if (!connectionInfo || !sqlQuery) return;

    // Switch to tune tab immediately
    setActiveAppTab('tune');
    setTuneActiveSubTab('plan');

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
      // setIsSidebarCollapsed removed

      // Fit view AND Position Overlay after sidebar transition (300ms)
      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2 });

        }
      }, 400);

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
      setTuneActiveSubTab('plan');
      setActiveAppTab('tune');

      // setIsSidebarCollapsed removed

      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2 });

        }
      }, 400);

    } catch (err: any) {
      console.error(err);
      setError("Invalid JSON Plan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Lazy Load Results
  useEffect(() => {
    if (activeAppTab === 'tune' && tuneActiveSubTab === 'results' && !executionResult && !loading && connectionInfo && sqlQuery) {
      setLoading(true);
      executeQuery(connectionInfo, sqlQuery, 10) // Limit 10
        .then(res => setExecutionResult(res.data))
        .catch(err => {
          console.error("Lazy execution failed", err);
        })
        .finally(() => setLoading(false));
    }
  }, [activeAppTab, tuneActiveSubTab, executionResult, loading, connectionInfo, sqlQuery]);

  const onNodeClick = useCallback((_event: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  // SQL Highlight Logic moved to QueryTuneTab

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f172a' }}>

      {/* 1. Header (Shared) */}
      <Header
        onNewPlan={() => {
          setSqlQuery('');
          setNodes([]);
          setActiveAppTab('editor');
        }}
        onHistory={() => setIsHistoryOpen(true)}
        onConnect={() => setIsModalOpen(true)}
      />

      {/* 2. Top Tab Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #334155', background: '#1e293b' }}>
        <button
          onClick={() => setActiveAppTab('editor')}
          style={{
            padding: '10px 20px', background: activeAppTab === 'editor' ? '#334155' : 'transparent', color: activeAppTab === 'editor' ? '#fff' : '#94a3b8',
            border: 'none', borderRight: '1px solid #334155', cursor: 'pointer', fontSize: '13px', fontWeight: 500
          }}
        >
          📝 Query Editor
        </button>
        <button
          onClick={() => setActiveAppTab('tune')}
          style={{
            padding: '10px 20px', background: activeAppTab === 'tune' ? '#334155' : 'transparent', color: activeAppTab === 'tune' ? '#fff' : '#94a3b8',
            border: 'none', borderRight: '1px solid #334155', cursor: 'pointer', fontSize: '13px', fontWeight: 500
          }}
        >
          ⚡ Query Tune
        </button>
        <button
          onClick={() => setActiveAppTab('server')}
          style={{
            padding: '10px 20px', background: activeAppTab === 'server' ? '#334155' : 'transparent', color: activeAppTab === 'server' ? '#fff' : '#94a3b8',
            border: 'none', borderRight: '1px solid #334155', cursor: 'pointer', fontSize: '13px', fontWeight: 500
          }}
        >
          🛠️ Server Tune
        </button>
      </div>

      {/* 3. Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Tab 1: Editor */}
        <div style={{ height: '100%', display: activeAppTab === 'editor' ? 'block' : 'none' }}>
          <QueryEditorTab
            connectionInfo={connectionInfo}
            sqlQuery={sqlQuery}
            setSqlQuery={setSqlQuery}
            onRun={() => handleRunExplain(true, false)}
          />
        </div>

        {/* Tab 2: Tune */}
        <div style={{ height: '100%', display: activeAppTab === 'tune' ? 'block' : 'none' }}>
          <QueryTuneTab
            activeTab={tuneActiveSubTab}
            setActiveTab={setTuneActiveSubTab}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNode(null)}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            explainResult={explainResult}
            executionResult={executionResult}
            loading={loading}
            error={error}
            sqlQuery={sqlQuery}
            flowWrapperRef={flowWrapperRef}
            reactFlowInstance={reactFlowInstance}
            setReactFlowInstance={setReactFlowInstance}
            onVisualizeJson={handleVisualizeJson}
            nodeTypes={nodeTypes}
          />
        </div>

        {/* Tab 3: Server */}
        <div style={{ height: '100%', display: activeAppTab === 'server' ? 'block' : 'none' }}>
          <ServerTuneTab connectionInfo={connectionInfo} />
        </div>

      </div>

      {/* Modals */}
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
          setActiveAppTab('editor');
        }}
      />
    </div>
  )
}

export default App
