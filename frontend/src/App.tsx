import { useState, useCallback, useEffect, useRef } from 'react'
import { Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import SettingsModal from './components/SettingsModal';
import { connectDb, explainQuery, getSavedQueryContent, executeQuery, getSchema, getConnectionConfig } from './api';
import { parsePlanToFlow } from './utils/planLayout';

// Workspace
import QueryWorkspace from './components/QueryWorkspace';
import AIChatSidebar from './components/AIChatSidebar';
import Toast from './components/Toast';
import SaveSessionModal from './components/SaveSessionModal';
import { analyzeQuery, saveQueryFinal } from './api';


function App() {
  const [showSettingsModal, setShowSettingsModal] = useState(true);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState('');

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
  const [sessionTitle, setSessionTitle] = useState('Untitled Query');

  const [chatHistory, setChatHistory] = useState<{
    role: 'user' | 'assistant',
    content: string,
    status?: 'success' | 'error' | 'pending',
    hidden?: boolean,
    respTime?: string,
    ttft?: string,
    planTime?: string,
    execTime?: string
  }[]>([]);

  const [schema, setSchema] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'generating'>('idle');

  const [diffBaseQuery, setDiffBaseQuery] = useState(() => {
    return localStorage.getItem('pgray_diff_base') || '';
  });
  const [showDiff, setShowDiff] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // AI Config
  const [localModel, setLocalModel] = useState<string>(() => {
    return localStorage.getItem('pgray_local_model') || 'qwen2.5-coder:latest';
  });
  const [activeProvider, setActiveProvider] = useState<string>(() => {
    return localStorage.getItem('pgray_ai_provider') || 'local';
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('pgray_gemini_model') || 'gemini-1.5-flash';
  });

  // Insights State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [actionableInsights, setActionableInsights] = useState<{ id: string, sql: string, description?: string }[]>([]);
  const [insightResults, setInsightResults] = useState<{ [id: string]: { status: 'success' | 'error', message: string } }>({});

  const [googleApiKey, setGoogleApiKey] = useState(() => {
    return localStorage.getItem('pgray_google_api_key') || '';
  });
  const [ollamaUrl, setOllamaUrl] = useState(() => {
    return localStorage.getItem('pgray_ollama_url') || 'http://localhost:11434';
  });

  // Performance Comparison State
  const [baselineMetrics, setBaselineMetrics] = useState<{ planning: number, execution: number } | null>(null);

  // Resize State
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [activeCenterTab, setActiveCenterTab] = useState<'editor' | 'tune' | 'server' | 'queries'>('editor');
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
  useEffect(() => { localStorage.setItem('pgray_google_api_key', googleApiKey); }, [googleApiKey]);
  useEffect(() => { localStorage.setItem('pgray_ollama_url', ollamaUrl); }, [ollamaUrl]);
  useEffect(() => { localStorage.setItem('pgray_local_model', localModel); }, [localModel]);
  useEffect(() => { localStorage.setItem('pgray_ai_provider', activeProvider); }, [activeProvider]);
  useEffect(() => { localStorage.setItem('pgray_gemini_model', geminiModel); }, [geminiModel]);

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

  const handleClearHistory = () => {
    if (confirm("Clear AI History?")) {
      setChatHistory([]);
    }
  };

  // Initial Connection Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const connRes = await getConnectionConfig();
        if (!cancelled && connRes && connRes.status === 'success' && connRes.data) {
          setConnectionInfo(connRes.data);
          setShowSettingsModal(false);
          // Auto-connect
          await connectDb(connRes.data).catch(e => console.error("Auto-connect failed", e));

          // Auto-execute if query exists (Startup Restore)
          if (sqlQuery && sqlQuery.trim()) {
            setIsExecuting(true);
            executeQuery(connRes.data, sqlQuery, 50)
              .then(execRes => {
                if (!cancelled) {
                  setExecutionResult(execRes.data);
                  setExecError(null);
                }
              })
              .catch(err => {
                console.error("Startup execution failed", err);
                // Silent fail on startup is okay, maybe they changed DBs
              })
              .finally(() => {
                if (!cancelled) setIsExecuting(false);
              });
          }
        } else {
          // Try loading from localStorage defaults if backend config missing
          try {
            const defs = JSON.parse(localStorage.getItem('pgray_connection_defaults') || '{}');
            if (defs.host && defs.database && defs.username) {
              // Ideally we need password. It's not saved. 
              // So we just show modal with pre-filled values (handled by Modal itself).
              // But maybe user *wants* to connect?
              // Just leave modal open.
              setShowSettingsModal(true);
            } else {
              setShowSettingsModal(true);
            }
          } catch { setShowSettingsModal(true); }
        }
      } catch {
        setShowSettingsModal(true);
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

  // New Save State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveAnalysis, setSaveAnalysis] = useState<{ title: string, params: any[], originalSql: string, loading: boolean }>({ title: '', params: [], originalSql: '', loading: false });
  const [queriesRefreshTrigger, setQueriesRefreshTrigger] = useState(0);

  const handleStartSave = async () => {
    if (!sqlQuery.trim()) return;

    // 1. Open Modal Immediately with Loading State
    setSaveAnalysis({
      title: '',
      params: [],
      originalSql: sqlQuery,
      loading: true
    });
    setIsSaveModalOpen(true);

    try {
      const existingTitle = sessionTitle !== 'Untitled Session' ? sessionTitle : undefined;
      const res = await analyzeQuery(sqlQuery, existingTitle);
      if (res && res.status === 'success' && res.data) {
        // 2. Update state asynchronously
        setSaveAnalysis(prev => ({
          ...prev,
          title: sessionTitle !== 'Untitled Session' ? sessionTitle : res.data.title,
          params: res.data.parameters,
          loading: false
        }));
      } else {
        // Stop loading even if invalid
        setSaveAnalysis(prev => ({ ...prev, loading: false }));
      }
    } catch (e) {
      console.error("Analysis failed", e);
      setSaveAnalysis(prev => ({ ...prev, loading: false }));
    }
  };

  const handleFinalSave = async (title: string, sql: string, params: any[]) => {
    try {
      const res = await saveQueryFinal(title, sql, params, saveAnalysis.originalSql);
      if (res.status === 'success') {
        setSessionTitle(title);
        // Alert is annoying, maybe toast?
        // alert(`Saved as: ${title}`);
        setToast({ message: `Saved as: ${title}`, type: 'success' });
        setIsSaveModalOpen(false);
        setQueriesRefreshTrigger(prev => prev + 1);
        setActiveCenterTab('queries'); // Explicitly go to queries
      }
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save query.");
    }
  };

  const handleAnalyzeParamQuery = (sql: string) => {
    setSqlQuery(sql);
    setActiveCenterTab('tune');
    // The useEffect in QueryTuneTab or App.tsx ...
  };

  const handleExecute = async (sqlOverride?: string) => {
    const queryToRun = sqlOverride || sqlQuery;
    if (!connectionInfo || !queryToRun) return;
    setIsExecuting(true);
    setExecError(null);
    setExecutionResult(null);

    try {
      const res = await executeQuery(connectionInfo, queryToRun, 50);
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
        if (Array.isArray(rawPlan) && rawPlan.length > 0) rawPlan = rawPlan;

        setExplainResult(rawPlan);
        if (res.data.text) setExplainText(res.data.text);
        else setExplainText(JSON.stringify(res.data.json, null, 2));

        // -- CAPTURE METRICS --
        const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
        const pTime = plan['Planning Time'] || 0;
        const eTime = (plan['Execution Time'] || plan['Total Runtime']) || 0;

        // If this is the FIRST successful run or explicit reset, set baseline
        if (!baselineMetrics) {
          setBaselineMetrics({ planning: pTime, execution: eTime });
        }

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

  const handleRunInsight = async (id: string, sql: string) => {
    setIsExecuting(true);
    try {
      await executeQuery(connectionInfo, sql, 50);
      setInsightResults(prev => ({
        ...prev,
        [id]: { status: 'success', message: 'Executed successfully' }
      }));
      setToast({ message: 'Insight executed successfully!', type: 'success' });
    } catch (err: any) {
      setInsightResults(prev => ({
        ...prev,
        [id]: { status: 'error', message: err.message || 'Execution failed' }
      }));
      setToast({ message: 'Failed to execute insight', type: 'error' });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleComparePerformance = async () => {
    if (!baselineMetrics || !connectionInfo || !sqlQuery) return;
    setLoadingExplain(true);
    try {
      const res = await explainQuery(connectionInfo, sqlQuery, true);
      if (res.data && res.data.json) {
        let rawPlan = res.data.json;
        if (Array.isArray(rawPlan) && rawPlan.length > 0) rawPlan = rawPlan;

        setExplainResult(rawPlan);
        if (res.data.text) setExplainText(res.data.text);

        const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
        const newP = plan['Planning Time'] || 0;
        const newE = (plan['Execution Time'] || plan['Total Runtime']) || 0;

        const diffP = newP - baselineMetrics.planning;
        const diffE = newE - baselineMetrics.execution;
        const pSign = diffP > 0 ? '+' : '';
        const eSign = diffE > 0 ? '+' : '';

        const msg = `Plan: ${pSign}${diffP.toFixed(2)}ms, Exec: ${eSign}${diffE.toFixed(2)}ms`;
        const type = diffE < 0 ? 'success' : 'info';
        setToast({ message: `Comparison: ${msg}`, type });

        let planRoot = Array.isArray(rawPlan) ? (rawPlan[0]['QUERY PLAN'] || rawPlan[0]['Plan']) : rawPlan;
        if (planRoot) {
          const { nodes: newNodes, edges: newEdges } = parsePlanToFlow(planRoot);
          setNodes(newNodes);
          setEdges(newEdges);
        }
      }
    } catch (err: any) {
      setToast({ message: 'Comparison failed', type: 'error' });
    } finally {
      setLoadingExplain(false);
    }
  };

  const handleAIStream = async (userMsg: string, displayMsg?: string, isAnalysis: boolean = false) => {
    setChatHistory(prev => [...prev, { role: 'user', content: displayMsg || userMsg }]);
    setAiLoading(true);
    setAiStatus('thinking');
    // Only set DiffBase if we are generating a NEW query (not analysis) to allow diffing against old one
    if (!isAnalysis) {
      setDiffBaseQuery(sqlQuery);
    }


    try {
      const promptToSend = displayMsg ? userMsg : `Existing SQL:\n\`\`\`sql\n${sqlQuery}\n\`\`\`\n\nUser Request: ${userMsg}`;
      const startTime = performance.now();

      const response = await fetch('http://localhost:9000/api/generate_sql_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          schema_data: schema,
          history: chatHistory,
          model: activeProvider === 'local' ? localModel : geminiModel,
          connection: connectionInfo,
          // If analysis, pass plan/query context is handled by prompt info usually, but let's be safe
          sql_query: isAnalysis ? sqlQuery : undefined,
          apiKey: googleApiKey,
          ollamaUrl: activeProvider === 'local' ? ollamaUrl : undefined
        })
      });

      if (!response.ok || !response.body) throw new Error("Network response was not ok");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamBuffer = "";
      let slowWarningTimer: any; // Use simple typing to avoid NodeJS.Timeout error vs number
      let firstTokenTime = 0;

      // Warning for slow start (Model Loading)
      slowWarningTimer = setTimeout(() => {
        if (streamBuffer.length === 0) {
          setToast({ message: "AI is warming up (loading model)...", type: 'info' });
        }
      }, 5000); // 5 seconds

      setChatHistory(prev => [...prev, { role: 'assistant', content: '...', status: 'pending', hidden: true }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          streamBuffer += chunk;
          if (streamBuffer.length > 10 && aiStatus === 'thinking') setAiStatus('generating');

          let ttftVal: string | undefined = undefined;
          if (firstTokenTime === 0) {
            firstTokenTime = performance.now();
            ttftVal = (firstTokenTime - startTime).toFixed(2);
          }

          setChatHistory(prev => {
            const newHist = [...prev];
            const last = newHist[newHist.length - 1];
            if (last.role === 'assistant') {
              last.content = streamBuffer;
              if (ttftVal) last.ttft = ttftVal;
            }
            return newHist;
          });

          // Real-time Editor Fill (Only for SQL Generation)
          if (!isAnalysis) {
            const sqlMarker = "```sql";
            const markerIndex = streamBuffer.indexOf(sqlMarker);
            if (markerIndex !== -1) {
              // Extract everything after ```sql
              let extracted = streamBuffer.substring(markerIndex + sqlMarker.length);
              // Check if there is a closing ```
              const closingIndex = extracted.indexOf("```");
              if (closingIndex !== -1) {
                extracted = extracted.substring(0, closingIndex);
              }
              // Update Editor
              setSqlQuery(extracted.trimStart());
            }
          }
        }
      }

      setAiLoading(false);
      setAiStatus('idle');
      clearTimeout(slowWarningTimer);
      // Finalize history status
      setChatHistory(prev => {
        const newHist = [...prev];
        const last = newHist[newHist.length - 1];
        if (last.role === 'assistant') { last.status = 'success'; last.hidden = false; }
        return newHist;
      });

      // Auto-Execute if Generation
      if (!isAnalysis && streamBuffer) {
        const sqlMarker = "```sql";
        const markerIndex = streamBuffer.indexOf(sqlMarker);
        if (markerIndex !== -1) {
          let extracted = streamBuffer.substring(markerIndex + sqlMarker.length);
          const closingIndex = extracted.indexOf("```");
          if (closingIndex !== -1) {
            extracted = extracted.substring(0, closingIndex).trim();
            // Execute
            if (extracted && connectionInfo) {
              setIsExecuting(true);
              setExecError(null);
              setExecutionResult(null);
              try {
                const res = await executeQuery(connectionInfo, extracted, 50);
                setExecutionResult(res.data);
              } catch (err: any) {
                console.error("Auto Execution failed", err);
                setExecError(err.response?.data?.detail || err.message || "Query execution failed");
              } finally {
                setIsExecuting(false);
              }
            }
          }
        }
      }

    } catch (error: any) {
      // @ts-ignore
      if (slowWarningTimer) clearTimeout(slowWarningTimer);
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
    // Open Sidebar
    if (sidebarWidth < 50) setSidebarWidth(400);

    const nodeLabel = node.data.label;
    const nodeDetails = JSON.stringify(node.data.details, null, 2);

    // Construct Prompt with Full Context
    const prompt = `I am analyzing a specific node in the query plan: "${nodeLabel}".
    
Current SQL:
\`\`\`sql
${sqlQuery}
\`\`\`

Full Execution Plan:
\`\`\`
${explainText}
\`\`\`

Target Node Details:
${nodeDetails}

Please provide a detailed analysis in the following format:

1. **Summary**: Briefly explain what this node is doing (e.g. "Scanning table users using index idx_users_email").
2. **Performance Analysis**: Is this operation expensive? Analyze cost, row estimates vs actuals, and timing. Loop count? 
3. **Optimization Strategy**: Suggest concrete steps to optimize this.
4. **Actionable SQL**:
   - Provide standard SQL commands (like CREATE INDEX, VACUUM, ANALYZE, etc.) that could fix the issue.
   - Output them in separate SQL code blocks.
   - Example:
     \`\`\`sql
     CREATE INDEX idx_users_email ON users (email);
     \`\`\`
`;

    // Standard Chat Stream
    handleAIStream(prompt, "Analyze Query and Plan", true);
  };

  // Parsing Insights from AI Stream (Hook into existing handleAIStream logic)
  useEffect(() => {
    if (chatHistory.length === 0) return;
    const lastMsg = chatHistory[chatHistory.length - 1];
    if (lastMsg.role === 'assistant' && lastMsg.status !== 'error') {
      // Regex to find SQL blocks
      const sqlBlocks = [];
      const regex = /```sql\s*([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(lastMsg.content)) !== null) {
        const sql = match[1].trim();
        // Valid insight if it's DDL or specific optimization
        if (/^(CREATE|DROP|ALTER|VACUUM|ANALYZE|CLUSTER|REINDEX)/i.test(sql)) {
          sqlBlocks.push({
            id: Math.random().toString(36).substr(2, 9),
            sql: sql,
            description: "Suggested Optimization"
          });
        }
      }
      // Only update if we found something new to avoid flickering? 
      // Actually, let's just set it if we're done or periodically.
      // For now, simple set.
      if (sqlBlocks.length > 0) {
        setActionableInsights(sqlBlocks);
      }
    }
  }, [chatHistory]);


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
          onSaveSession={handleStartSave}
          onAnalyzeParamQuery={handleAnalyzeParamQuery}
          onEdit={(sql, name) => {
            setSqlQuery(sql);
            setSessionTitle(name);
            setActiveCenterTab('editor');
          }}
          onOpenSettings={() => setShowSettingsModal(true)}

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
          insights={actionableInsights}
          onRunInsight={handleRunInsight}
          insightResults={insightResults}
          onCompare={handleComparePerformance}
          baselineMetrics={baselineMetrics}
          queriesRefreshTrigger={queriesRefreshTrigger}
          activeTab={activeCenterTab}
          setActiveTab={setActiveCenterTab}
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
          selectedModel={activeProvider}
          onModelChange={setActiveProvider}
          googleApiKey={googleApiKey}
          onSetGoogleApiKey={setGoogleApiKey}
          onOpenSettings={() => setShowSettingsModal(true)}
          onClearHistory={handleClearHistory}
        />
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          connectionInfo={connectionInfo}
          onConnect={(conn) => {
            setConnectionInfo(conn);
            setShowSettingsModal(false);
            connectDb(conn);
          }}
          ollamaUrl={ollamaUrl}
          onSaveOllamaUrl={setOllamaUrl}
          geminiKey={googleApiKey}
          onSaveGeminiKey={setGoogleApiKey}
          geminiModel={geminiModel}
          onSaveGeminiModel={setGeminiModel}
          localModel={localModel}
          onSaveLocalModel={setLocalModel}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {isSaveModalOpen && (
        <SaveSessionModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={handleFinalSave}
          initialTitle={saveAnalysis.title}
          initialParams={saveAnalysis.params}
          originalSql={saveAnalysis.originalSql}
          loading={saveAnalysis.loading}
        />
      )}
    </div>
  );
}

export default App;
