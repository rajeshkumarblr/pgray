import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import ConnectionModal from './components/ConnectionModal';
import { connectDb, explainQuery, getSavedQueryContent, executeQuery, saveParameterizedQuery, getSchema, getConnectionConfig } from './api';
import { parsePlanToFlow } from './utils/planLayout';

// Workspace
import QueryWorkspace from './components/QueryWorkspace';
import AIChatSidebar from './components/AIChatSidebar';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState(() => {
    return localStorage.getItem('pgray_sql_query') || '';
  });

  // Results State (Lifted)
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Explain State
  const [explainResult, setExplainResult] = useState<any>(null);
  const [explainText, setExplainText] = useState<string>('');
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explainError, setExplainError] = useState('');

  // Visualization State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  // Note: selectedNode is already managed below
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);


  // Session State
  const [sessionTitle, setSessionTitle] = useState(() => {
    return localStorage.getItem('pgray_session_title') || 'Untitled Session';
  });

  const [chatHistory, setChatHistory] = useState<{
    role: 'user' | 'assistant',
    content: string,
    status?: 'success' | 'error' | 'pending',
    hidden?: boolean,
    respTime?: string,
    planTime?: string,
    execTime?: string
  }[]>(() => {
    const saved = localStorage.getItem('pgray_chat_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [schema, setSchema] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'generating'>('idle');

  const [diffBaseQuery, setDiffBaseQuery] = useState(() => {
    return localStorage.getItem('pgray_diff_base') || '';
  });
  const [showDiff, setShowDiff] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5-coder:14b'); // Default Model

  // Resize State
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isResizingSidebar = useRef(false);

  const startSidebarResize = (e: React.MouseEvent) => {
    isResizingSidebar.current = true;
    e.preventDefault();
    document.addEventListener('mousemove', handleSidebarResize);
    document.addEventListener('mouseup', stopSidebarResize);
  };

  const handleSidebarResize = (e: MouseEvent) => {
    if (!isResizingSidebar.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < 800) {
      setSidebarWidth(newWidth);
    }
  };

  const stopSidebarResize = () => {
    isResizingSidebar.current = false;
    document.removeEventListener('mousemove', handleSidebarResize);
    document.removeEventListener('mouseup', stopSidebarResize);
  };

  // Persistence Effects
  useEffect(() => { localStorage.setItem('pgray_chat_history', JSON.stringify(chatHistory)); }, [chatHistory]);
  useEffect(() => { localStorage.setItem('pgray_session_title', sessionTitle); }, [sessionTitle]);
  useEffect(() => { localStorage.setItem('pgray_diff_base', diffBaseQuery); }, [diffBaseQuery]);
  useEffect(() => { localStorage.setItem('pgray_sql_query', sqlQuery); }, [sqlQuery]);

  // Schema Fetching
  useEffect(() => {
    if (connectionInfo) {
      setLoadingSchema(true);
      getSchema(connectionInfo)
        .then(data => setSchema(data.data))
        .catch(err => console.error("Schema fetch error", err))
        .finally(() => setLoadingSchema(false));
    }
  }, [connectionInfo]);

  // Initial Connection Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const connRes = await getConnectionConfig();
        if (!cancelled && connRes && connRes.status === 'success' && connRes.data) {
          setConnectionInfo(connRes.data);
          setIsModalOpen(false);
          // Auto-connect
          connectDb(connRes.data).catch(e => console.error("Auto-connect failed", e));
        }
      } catch {
        // Ignore network errors on init
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- Handlers ---

  const handleLoadSession = async (name: string) => {
    try {
      const data = await getSavedQueryContent(name);
      if (data) {
        setSqlQuery(data.sql || '');
        setChatHistory(data.history || []);
        setSessionTitle(name);
        setExecutionResult(null);
        setExecError(null);
        setExplainResult(null);
        setExplainText('');
        setNodes([]);
        setEdges([]);
      }
    } catch (e) { console.error("Load session failed", e); }
  };

  const handleNewSession = async () => {
    // Auto-save disabled as per user request
    // Just clear state
    setSqlQuery('');
    setChatHistory([]);
    setSessionTitle('Untitled Session');
    setExecutionResult(null);
    setExecError(null);
    setExplainResult(null);
    setExplainText('');
    setNodes([]);
    setEdges([]);
    setShowDiff(false);
  };

  const handleSaveParameterized = async () => {
    if (!sqlQuery.trim()) return;
    try {
      const res = await saveParameterizedQuery(sqlQuery);
      if (res.status === 'success') {
        const newTitle = res.data.name;
        setSessionTitle(newTitle); // Update Session Title
        alert(`Saved as: ${newTitle}\nParams: ${res.data.params.join(', ')}`);
      }
    } catch (e: any) {
      alert("Failed to save parameterized query");
      console.error(e);
    }
  };

  const handleExecute = async () => {
    if (!connectionInfo || !sqlQuery) return;
    setIsExecuting(true);
    setExecError(null);
    setExecutionResult(null);

    try {
      const res = await executeQuery(connectionInfo, sqlQuery, 50);
      setExecutionResult(res.data);
    } catch (err: any) {
      console.error("Execution failed", err);
      setExecError(err.response?.data?.detail || err.message || "Query execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTune = async () => {
    if (!connectionInfo || !sqlQuery) return;
    setLoadingExplain(true);
    setExplainError('');
    setNodes([]);
    setEdges([]);

    try {
      const res = await explainQuery(connectionInfo, sqlQuery, true);
      if (res.data && res.data.json) {
        let rawPlan = res.data.json;
        // Normalize plan if array
        if (Array.isArray(rawPlan) && rawPlan.length > 0) rawPlan = rawPlan;

        setExplainResult(rawPlan);
        if (res.data.text) setExplainText(res.data.text);
        else setExplainText(JSON.stringify(res.data.json, null, 2));

        // Parse to Flow
        let planRoot = Array.isArray(rawPlan) ? (rawPlan[0]['QUERY PLAN'] || rawPlan[0]['Plan']) : rawPlan;
        if (planRoot) {
          const { nodes: newNodes, edges: newEdges } = parsePlanToFlow(planRoot);
          setNodes(newNodes);
          setEdges(newEdges);
        }
      }
    } catch (err: any) {
      console.error("Explain failed", err);
      setExplainError(err.message || "Explain failed");
    } finally {
      setLoadingExplain(false);
    }
  };

  const handleAIStream = async (userMsg: string) => {
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);
    setAiStatus('thinking');
    setDiffBaseQuery(sqlQuery);

    const startTimeStr = performance.now();

    try {
      const promptToSend = `Existing SQL:\n\`\`\`sql\n${sqlQuery}\n\`\`\`\n\nUser Request: ${userMsg}`;
      const response = await fetch('http://localhost:9000/api/generate_sql_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          schema_data: schema,
          history: chatHistory,
          model: selectedModel,
          connection: connectionInfo
        })
      });

      if (!response.ok || !response.body) throw new Error("Network response was not ok");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamBuffer = "";

      setChatHistory(prev => [...prev, { role: 'assistant', content: '...', status: 'pending', hidden: true }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          streamBuffer += chunk;

          if (streamBuffer.length > 10 && aiStatus === 'thinking') setAiStatus('generating');

          setChatHistory(prev => {
            const newHist = [...prev];
            const last = newHist[newHist.length - 1];
            if (last.role === 'assistant') {
              last.content = streamBuffer;
            }
            return newHist;
          });

          // Live Editor Update
          const match = streamBuffer.match(/```sql\s*([\s\S]*?)```/) || streamBuffer.match(/```sql\s*([\s\S]*)$/);
          if (match && match[1]) {
            // Strip Title line if it sneaks in
            const rawSql = match[1].trim();
            const cleanSql = rawSql.replace(/^Title:.*(\r\n|\n|\r)?/im, '').trim();
            setSqlQuery(cleanSql);
          }
        }
      }

      // Cleanup
      let finalQuery = "";
      const sqlMatch = streamBuffer.match(/```sql\s*([\s\S]*?)```/);
      if (sqlMatch && sqlMatch[1]) finalQuery = sqlMatch[1].replace(/^Title:.*(\r\n|\n|\r)?/im, '').trim();
      else {
        // Fallback cleanup
        // No title expected
        let clean = streamBuffer.trim();
        if (/^(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(clean)) finalQuery = clean;
      }

      if (finalQuery) setSqlQuery(finalQuery);

      const endTime = performance.now();
      const durationSeconds = ((endTime - startTimeStr) / 1000).toFixed(2);

      setAiLoading(false);
      setAiStatus('idle');

      // 4. Auto-Execute for Plan & Timings (User Request)
      if (finalQuery && connectionInfo) {
        try {
          setIsExecuting(true); // Show spinner in results

          // 1. Execute Query (Fast Path - Show Results immediately)
          executeQuery(connectionInfo, finalQuery, 50)
            .then(execRes => {
              setExecutionResult(execRes.data);
              setExecError(null);
            })
            .catch(err => {
              setExecError(err.message || "Query execution failed");
            })
            .finally(() => {
              setIsExecuting(false);
            });

          // 2. Explain Analyze (Background - Update Timings when ready)
          explainQuery(connectionInfo, finalQuery, true).then(explainRes => {
            if (explainRes.data && explainRes.data.json) {
              const plan = explainRes.data.json[0]; // Assuming array
              const pTimeVal = plan['Planning Time'] || 0;
              const eTimeVal = (plan['Execution Time'] || plan['Total Runtime']) || 0;
              const totalTimeVal = pTimeVal + eTimeVal;

              const pTime = pTimeVal.toFixed(2);
              const eTime = eTimeVal.toFixed(2);
              const tTime = totalTimeVal.toFixed(2);

              // Update History with these times
              setChatHistory(prev => {
                const newHistory = [...prev];
                const lastIndex = newHistory.length - 1;
                if (lastIndex >= 0 && newHistory[lastIndex].role === 'assistant') {
                  newHistory[lastIndex].status = 'success';
                  newHistory[lastIndex].hidden = false;
                  newHistory[lastIndex].respTime = durationSeconds;
                  // New Format fields
                  (newHistory[lastIndex] as any).totalTime = tTime;
                  newHistory[lastIndex].planTime = pTime;
                  newHistory[lastIndex].execTime = eTime;
                }
                return newHistory;
              });

              // Populate Tune Tab State
              setExplainResult([plan]); // Ensure array
              if (explainRes.data.text) setExplainText(explainRes.data.text);
              else setExplainText(JSON.stringify(plan, null, 2));

              // Visualizer Nodes
              let planRoot = plan['QUERY PLAN'] || plan['Plan'];
              if (planRoot) {
                const { nodes: newNodes, edges: newEdges } = parsePlanToFlow(planRoot);
                setNodes(newNodes);
                setEdges(newEdges);
              }
            }
          }).catch(err => {
            console.error("Auto-explain failed", err);
            // Not fatal for results
          });

        } catch (err: any) {
          // Catch immediate sync errors if any, though promises handle async
          console.error("Auto-run setup failed", err);
        }
      } else {
        // No query generated or no connection, just finalize
        setChatHistory(prev => {
          const newHistory = [...prev];
          const lastIndex = newHistory.length - 1;
          if (lastIndex >= 0 && newHistory[lastIndex].role === 'assistant') {
            newHistory[lastIndex].status = 'success';
            newHistory[lastIndex].hidden = false;
            newHistory[lastIndex].respTime = durationSeconds;
          }
          return newHistory;
        });
      }

    } catch (error: any) {
      console.error(error);
      setAiLoading(false);
      setAiStatus('idle');
      setChatHistory(prev => {
        const newHist = [...prev];
        const lastIndex = newHist.length - 1;
        if (lastIndex >= 0) {
          newHist[lastIndex].content += `\n❌ Error: ${error.message}`;
          newHist[lastIndex].status = 'error';
          newHist[lastIndex].hidden = false;
        }
        return newHist;
      });
    }
  };

  const handleAnalyzeNode = async (node: Node) => {
    // Open Sidebar if needed (assume width > 0 means open, or just ensure it's visible)
    if (sidebarWidth < 50) setSidebarWidth(400);

    const nodeLabel = node.data.label;
    const nodeDetails = JSON.stringify(node.data.details, null, 2);

    // Construct Prompt
    const prompt = `I am analyzing a specific node in the query plan: "${nodeLabel}".
    
Node Details:
${nodeDetails}

Please analyze this specific operation. 
1. Is this operation expensive?
2. Why is the database choosing this method?
3. Suggestions for optimization (e.g. indexes, query changes).
`;

    // Send to AI
    handleAIStream(prompt);
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', background: '#0f172a', overflow: 'hidden' }}>

      {/* Main Workspace */}
      <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
        <QueryWorkspace
          connectionInfo={connectionInfo}
          sqlQuery={sqlQuery}
          setSqlQuery={setSqlQuery}
          schema={schema}
          loadingSchema={loadingSchema}

          sessionTitle={sessionTitle}
          setSessionTitle={setSessionTitle}
          onLoadSession={handleLoadSession}
          onNewSession={handleNewSession}
          onSaveSession={handleSaveParameterized}

          onExecute={handleExecute}
          isExecuting={isExecuting}
          executionResult={executionResult}
          execError={execError}

          onTune={handleTune}
          explainResult={explainResult}
          explainText={explainText}
          loadingExplain={loadingExplain}
          explainError={explainError}

          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}

          diffBaseQuery={diffBaseQuery}
          showDiff={showDiff}
          setShowDiff={setShowDiff}

          // No op replacement to just update timestamp if needed? No.
          // I will actually add a 'fitView' trigger to QueryWorkspace if possible?
          // Let's rely on QueryTuneTab auto-fitting?
          // QueryTuneTab doesn't auto-fit on prop change currently.
          // I should add useEffect in QueryTuneTab to fitView when nodes change.
          onCopy={() => navigator.clipboard.writeText(sqlQuery)}
          onReset={() => { setSqlQuery(''); setExecutionResult(null); }}
          onAnalyzeNode={handleAnalyzeNode}
        />
      </div>

      {/* Global AI Sidebar on the Right */}
      <div
        onMouseDown={startSidebarResize}
        style={{
          width: '5px',
          cursor: 'col-resize',
          background: '#1e293b',
          borderLeft: '1px solid #334155',
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
      >
        <div style={{ width: '2px', height: '30px', background: '#475569', borderRadius: '2px' }} />
      </div>

      <div style={{ width: `${sidebarWidth}px`, height: '100%' }}>
        <AIChatSidebar
          messages={chatHistory}
          onSend={handleAIStream}
          loading={aiLoading}
          aiState={aiStatus}
          title="AI Assistant"
          onRunSql={(sql) => { setSqlQuery(sql); }}
          onClose={() => { }}
        />
      </div>

      {/* Connection Modal */}
      {isModalOpen && (
        <ConnectionModal
          onConnect={(conn) => { setConnectionInfo(conn); setIsModalOpen(false); connectDb(conn); }}
        />
      )}
    </div>
  );
}

export default App;
