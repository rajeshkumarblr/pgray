import { useState, useCallback, useEffect, useRef } from 'react'
import { Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import * as Diff from 'diff';
import SettingsModal from './components/SettingsModal';
import { connectDb, explainQuery, getSavedQueryContent, executeQuery, getSchema, getConnectionConfig } from './api';
import { parsePlanToFlow } from './utils/planLayout';

// Workspace
import QueryWorkspace from './components/QueryWorkspace';
import AIChatSidebar from './components/AIChatSidebar';
import Toast from './components/Toast';
import SaveSessionModal from './components/SaveSessionModal';
import { analyzeQuery, saveQueryFinal, generateSql } from './api';


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
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);
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
  const [activeCenterTab, setActiveCenterTab] = useState<'search' | 'editor' | 'tune' | 'server' | 'queries' | 'schema' | 'er'>('search');
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
              })
              .finally(() => {
                if (!cancelled) setIsExecuting(false);
              });
          }
        } else {
          try {
            const defs = JSON.parse(localStorage.getItem('pgray_connection_defaults') || '{}');
            if (defs.host || defs.database) {
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
        setSaveAnalysis(prev => ({
          ...prev,
          title: sessionTitle !== 'Untitled Session' ? sessionTitle : res.data.title,
          params: res.data.parameters,
          loading: false
        }));
      } else {
        setSaveAnalysis(prev => ({ ...prev, loading: false }));
      }
    } catch (e) {
      console.error("Analysis failed", e);
      setSaveAnalysis(prev => ({ ...prev, loading: false }));
    }
  };

  const handleFinalSave = async (title: string, sql: string, params: any[]) => {
    try {
      const res = await saveQueryFinal(title, sql, params, saveAnalysis.originalSql, connectionInfo);
      if (res.status === 'success') {
        setSessionTitle(title);
        setToast({ message: `Saved as: ${title}`, type: 'success' });
        setIsSaveModalOpen(false);
        setQueriesRefreshTrigger(prev => prev + 1);
        setActiveCenterTab('queries');
      }
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save query.");
    }
  };

  const handleAnalyzeParamQuery = (sql: string) => {
    setSqlQuery(sql);
    setActiveCenterTab('tune');
  };

  const handleExecute = async (sqlOverride?: string, params: any = null) => {
    const queryToRun = sqlOverride || sqlQuery;
    if (!connectionInfo || !queryToRun) return;
    setIsExecuting(true);
    setExecError(null);
    setExecutionResult(null);

    try {
      const res = await executeQuery(connectionInfo, queryToRun, 50, params);
      setExecutionResult(res.data);
    } catch (err: any) {
      console.error("Execution failed", err);
      setExecError(err.response?.data?.detail || err.message || "Query execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTune = async (params: any = null) => {
    if (!connectionInfo || !sqlQuery) return;
    setLoadingExplain(true);
    setExplainError('');
    setNodes([]);
    setEdges([]);

    try {
      const res = await explainQuery(connectionInfo, sqlQuery, true, params);
      if (res.data && res.data.json) {
        let rawPlan = res.data.json;
        if (Array.isArray(rawPlan) && rawPlan.length > 0) rawPlan = rawPlan;

        setExplainResult(rawPlan);
        if (res.data.text) setExplainText(res.data.text);
        else setExplainText(JSON.stringify(res.data.json, null, 2));

        const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
        const pTime = plan['Planning Time'] || 0;
        const eTime = (plan['Execution Time'] || plan['Total Runtime']) || 0;

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
          sql_query: isAnalysis ? sqlQuery : undefined,
          apiKey: googleApiKey,
          ollamaUrl: activeProvider === 'local' ? ollamaUrl : undefined
        })
      });

      if (!response.ok || !response.body) throw new Error("Network response was not ok");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let rawBuffer = "";   // Buffer for raw JSON chunks
      let textBuffer = "";  // Buffer for Clean Text (for SQL extraction)
      let slowWarningTimer: any;
      let firstTokenTime = 0;

      slowWarningTimer = setTimeout(() => {
        if (textBuffer.length === 0) {
          setToast({ message: "AI is warming up...", type: 'info' });
        }
      }, 5000);

      // Start assistant message
      setChatHistory(prev => [...prev, { role: 'assistant', content: '', status: 'pending', hidden: false }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          rawBuffer += chunk;

          // Split by newline to get complete JSON objects
          const lines = rawBuffer.split('\n');
          rawBuffer = lines.pop() || ""; // Keep the last incomplete fragment

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);

              if (json.error) {
                throw new Error(json.error);
              }

              // Extract text content from JSON
              const token = json.response || "";

              if (textBuffer.length === 0 && token) setAiStatus('generating');

              let ttftVal: string | undefined = undefined;
              if (firstTokenTime === 0 && token) {
                firstTokenTime = performance.now();
                ttftVal = (firstTokenTime - startTime).toFixed(2);
              }

              textBuffer += token; // Accumulate CLEAN text

              setChatHistory(prev => {
                const newHist = [...prev];
                const lastIndex = newHist.length - 1;
                // Deep clone the last message to avoid mutating previous state reference
                const last = { ...newHist[lastIndex] };

                if (last.role === 'assistant') {
                  last.content = (last.content || "") + token;
                  if (ttftVal) last.ttft = ttftVal;
                  if (json.total_duration) last.respTime = json.total_duration;

                  newHist[lastIndex] = last; // Replace with updated copy
                }
                return newHist;
              });

              // Real-time Editor Fill (Using CLEAN textBuffer)
              if (!isAnalysis) {
                const sqlMarker = "```sql";
                const markerIndex = textBuffer.indexOf(sqlMarker);
                if (markerIndex !== -1) {
                  let extracted = textBuffer.substring(markerIndex + sqlMarker.length);
                  const closingIndex = extracted.indexOf("```");
                  if (closingIndex !== -1) {
                    extracted = extracted.substring(0, closingIndex);
                  }
                  setSqlQuery(extracted.trimStart());
                }
              }

            } catch (e) {
              console.error("JSON Parse Error", e);
            }
          }
        }
      }

      setAiLoading(false);
      setAiStatus('idle');
      clearTimeout(slowWarningTimer);

      setChatHistory(prev => {
        const newHist = [...prev];
        const last = newHist[newHist.length - 1];
        if (last.role === 'assistant') { last.status = 'success'; last.hidden = false; }
        return newHist;
      });

      // Highlight Differences if logic changed
      if (!isAnalysis && diffBaseQuery && textBuffer && diffBaseQuery !== textBuffer) {
        // Calculate diff lines
        const diff = Diff.diffLines(diffBaseQuery, textBuffer);
        const linesToHighlight: number[] = [];
        let currentLine = 1;

        diff.forEach(part => {
          const lineCount = part.value.replace(/\n$/, "").split("\n").length;
          if (part.added) {
            for (let i = 0; i < lineCount; i++) {
              linesToHighlight.push(currentLine + i);
            }
            currentLine += lineCount;
          } else if (!part.removed) {
            currentLine += lineCount;
          }
          // if removed, do nothing (lines disappear)
        });

        setHighlightedLines(linesToHighlight);
      }

      // Auto-Execute check (Using CLEAN textBuffer)
      if (!isAnalysis && textBuffer) {
        const sqlMarker = "```sql";
        const markerIndex = textBuffer.indexOf(sqlMarker);
        if (markerIndex !== -1) {
          let extracted = textBuffer.substring(markerIndex + sqlMarker.length);
          const closingIndex = extracted.indexOf("```");
          if (closingIndex !== -1) {
            extracted = extracted.substring(0, closingIndex).trim();
            if (extracted && connectionInfo) {
              setIsExecuting(true);
              setExecError(null);
              setExecutionResult(null);
              try {
                const res = await executeQuery(connectionInfo, extracted, 50);
                setExecutionResult(res.data);
              } catch (err: any) {
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
    if (sidebarWidth < 50) setSidebarWidth(400);

    const nodeLabel = node.data.label;
    const nodeDetails = JSON.stringify(node.data.details, null, 2);

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

    handleAIStream(prompt, "Analyze Query and Plan", true);
  };

  useEffect(() => {
    if (chatHistory.length === 0) return;
    const lastMsg = chatHistory[chatHistory.length - 1];
    if (lastMsg.role === 'assistant' && lastMsg.status !== 'error') {
      const sqlBlocks = [];
      const regex = /```sql\s*([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(lastMsg.content)) !== null) {
        const sql = match[1].trim();
        if (/^(CREATE|DROP|ALTER|VACUUM|ANALYZE|CLUSTER|REINDEX)/i.test(sql)) {
          sqlBlocks.push({
            id: Math.random().toString(36).substr(2, 9),
            sql: sql,
            description: "Suggested Optimization"
          });
        }
      }
      if (sqlBlocks.length > 0) {
        setActionableInsights(sqlBlocks);
      }
    }
  }, [chatHistory]);

  const handleIndexDatabase = useCallback(async () => {
    if (!connectionInfo) {
      setToast({ message: 'No active connection.', type: 'error' });
      return;
    }

    setToast({ message: 'Indexing database for AI search... this may take 10-30 seconds.', type: 'info' });

    try {
      const response = await fetch('http://localhost:9000/api/search/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: connectionInfo, force: true })
      });

      const data = await response.json();

      if (data.status === 'success') {
        setToast({ message: `Search Index Built! ${data.indexed_entries} items indexed. AI is now data-aware.`, type: 'success' });
      } else {
        setToast({ message: `Indexing failed: ${data.message}`, type: 'error' });
      }
    } catch (error) {
      setToast({ message: `Indexing error: ${error}`, type: 'error' });
    }
  }, [connectionInfo]);


  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', background: '#0f172a', overflow: 'hidden' }}>

      {/* Main Workspace */}
      <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
        <QueryWorkspace
          connectionInfo={connectionInfo}
          sqlQuery={sqlQuery}
          setSqlQuery={(q) => { setSqlQuery(q); setHighlightedLines([]); }}
          highlightedLines={highlightedLines}
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

          onCopy={() => navigator.clipboard.writeText(sqlQuery)}
          onReset={() => { setSqlQuery(''); setExecutionResult(null); }}

          onAnalyzeNode={handleAnalyzeNode}
          onAskAI={handleAIStream}
          insights={actionableInsights}
          onRunInsight={handleRunInsight}
          insightResults={insightResults}
          onCompare={handleComparePerformance}
          baselineMetrics={baselineMetrics}
          queriesRefreshTrigger={queriesRefreshTrigger}
          activeTab={activeCenterTab}
          setActiveTab={setActiveCenterTab}
          onAppSearch={async (prompt: string) => {
            // Unified NL-to-SQL Search
            if (!connectionInfo) return;
            setIsExecuting(true);
            setExecutionResult(null);
            setExecError(null);
            setSqlQuery(''); // Clear previous
            setActiveCenterTab('search');

            try {
              // 1. Generate SQL
              // Note: We ignore history for search tab typically? Or should we pass it? 
              // For "Google-like", usually one-shot.
              const res = await generateSql(prompt, schema, [], activeProvider === 'local' ? localModel : geminiModel, connectionInfo);

              let generatedSql = "";
              if (res.sql) {
                generatedSql = res.sql;
              } else if (res.response) {
                // Extract SQL if wrapped in markdown
                const match = res.response.match(/```sql\n([\s\S]*?)\n```/);
                if (match) generatedSql = match[1];
                else generatedSql = res.response; // Fallback
              }

              if (generatedSql) {
                setSqlQuery(generatedSql);
                // 2. Execute SQL
                try {
                  const execRes = await executeQuery(connectionInfo, generatedSql, 50);
                  setExecutionResult(execRes.data);
                } catch (execErr: any) {
                  setExecError(execErr.response?.data?.detail || execErr.message || "Execution Failed");
                }
              } else {
                setExecError("Could not generate SQL from prompt.");
              }

            } catch (e: any) {
              setExecError(e.message || "Search failed");
            } finally {
              setIsExecuting(false);
            }
          }}
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
          display: activeCenterTab === 'search' ? 'none' : 'flex',
          justifyContent: 'center', alignItems: 'center'
        }}
      >
        <div style={{ width: '2px', height: '30px', background: '#475569', borderRadius: '2px' }} />
      </div>

      <div style={{ width: `${sidebarWidth}px`, height: '100%', display: activeCenterTab === 'search' ? 'none' : 'block' }}>
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
          onIndexDatabase={handleIndexDatabase}
          connectionInfo={connectionInfo}
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