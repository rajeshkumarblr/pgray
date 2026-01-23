import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Node, Edge, applyNodeChanges, NodeChange } from 'reactflow';
import ConnectionModal from './components/ConnectionModal';
import PlanNode from './components/PlanNode';
import { connectDb, explainQuery } from './api';
import { parsePlanToFlow } from './utils/planLayout';
import HistoryModal from './components/HistoryModal';

// Tabs
import QueryEditorTab, { QueryEditorRef } from './components/tabs/QueryEditorTab';
import QueryTuneTab from './components/tabs/QueryTuneTab';
import ServerTuneTab from './components/tabs/ServerTuneTab';
import * as Diff from 'diff';
import AIChatSidebar from './components/AIChatSidebar';
import StatusBar from './components/StatusBar';
import { getSchema } from './api';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [sqlQuery, setSqlQuery] = useState(() => {
    return localStorage.getItem('pgray_sql_query') || '';
  });
  const [explainResult, setExplainResult] = useState<any>(null);
  const [explainText, setExplainText] = useState<string>(''); // Added for Text Plan

  // Lifted State from QueryEditorTab
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
  const [tuneChatHistory, setTuneChatHistory] = useState<{ role: 'user' | 'assistant', content: string, status?: 'success' | 'error' | 'pending' }[]>(() => {
    const saved = localStorage.getItem('pgray_tune_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [diffBaseQuery, setDiffBaseQuery] = useState(() => {
    return localStorage.getItem('pgray_diff_base') || '';
  });
  const [schema, setSchema] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'warning' | 'error' | 'success'>('info');

  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'generating'>('idle'); // Added AI Status
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Default OPEN in global view
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5-coder:14b'); // Default Model

  // Lifted Diff State
  const [showDiff, setShowDiff] = useState(false);

  // Ref for Auto-Execution
  const queryEditorRef = useRef<QueryEditorRef>(null);

  // ... (Persistence Effects unchanged)

  const handleDiff = (sql: string) => {
    // Logic:
    // 1. If Diff View is NOT open, open it.
    // 2. Set 'diffBaseQuery' to the PREVIOUS SQL (simplified for now: whatever was in 'sqlQuery' before?
    //    Actually, 'diffBaseQuery' is normally set before AI generation. 
    //    If user clicks "Diff" on an older message, we might want to compare THAT SQL with the current one?
    //    Or compare THAT SQL with the one before it?
    //    Simplest user flow: "Diff" button simply opens the diff view with the current editor content vs the clicked SQL?
    //    User Request: "Diff should give the diff between the current SQL to prev SQL."
    //    If we are just toggling the view, it compares 'diffBaseQuery' (set at start of stream) vs 'sqlQuery' (current).
    //    So just opening the view is likely enough if 'diffBaseQuery' was set correctly during generation.
    setShowDiff(true);
  };


  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('pgray_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem('pgray_tune_chat_history', JSON.stringify(tuneChatHistory));
  }, [tuneChatHistory]);

  useEffect(() => {
    localStorage.setItem('pgray_session_title', sessionTitle);
  }, [sessionTitle]);

  useEffect(() => {
    localStorage.setItem('pgray_diff_base', diffBaseQuery);
  }, [diffBaseQuery]);




  // Schema Fetching (Global)
  useEffect(() => {
    if (connectionInfo) {
      setLoadingSchema(true);
      getSchema(connectionInfo)
        .then(data => setSchema(data.data))
        .catch(err => console.error("Schema fetch error", err))
        .finally(() => setLoadingSchema(false));
    }
  }, [connectionInfo]);

  // AI Stream Handler (Global)
  const handleAIStream = async (userMsg: string) => {
    // Trigger Smart Title if still untitled
    // Trigger Smart Title if still untitled (Now handled in stream)
    if (sessionTitle === 'Untitled Session') {
      setStatusMessage("Generating Session Title & SQL...");
      setStatusType('info');
    }

    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);
    setAiStatus('thinking'); // START THINKING
    setHighlightedLines([]);
    const previousQuery = sqlQuery;
    setDiffBaseQuery(previousQuery);

    // Use ref for timing to persist across re-renders/closures if needed, 
    // but local var is fine here since loop blocks? No, await blocks. 
    // Better use a const outside the loop.
    const startTimeStr = performance.now();

    setStatusMessage("Thinking...");
    setStatusType('info');

    try {
      const promptToSend = `Existing SQL:\n\`\`\`sql\n${sqlQuery}\n\`\`\`\n\nUser Request: ${userMsg}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('http://localhost:9000/api/generate_sql_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          schema_data: schema,
          history: chatHistory,
          model: selectedModel,
          connection: connectionInfo
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok || !response.body) {
        throw new Error(response.statusText || "Network response was not ok");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamBuffer = "";

      // Add pending assistant message (HIDDEN by default)
      setChatHistory(prev => [...prev, { role: 'assistant', content: '...', status: 'pending', hidden: true }]);

      let firstChunk = true;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          if (firstChunk) {
            setAiStatus('generating'); // SWITCH TO GENERATING
            setStatusMessage("Processing...");
            setStatusType('info');
            firstChunk = false;
          }
          const chunk = decoder.decode(value, { stream: true });
          streamBuffer += chunk;

          // Update Chat History (keep hidden unless error later)
          setChatHistory(prev => {
            const newHist = [...prev];
            const last = newHist[newHist.length - 1];
            if (last.role === 'assistant') {
              last.content = streamBuffer;
            }
            return newHist;
          });

          // Check for Title Line (Optimization)
          const titleMatch = streamBuffer.match(/^Title:\s*(.+)$/m);
          if (titleMatch && sessionTitle === 'Untitled Session') {
            const newTitle = titleMatch[1].trim();
            setSessionTitle(newTitle);
            // setStatusMessage("Session: " + newTitle);
          }

          // Check for SQL Block and Update Editor
          // Regex to match either a complete block OR an open block
          const completeMatch = streamBuffer.match(/```sql\s*([\s\S]*?)```/);
          const openMatch = streamBuffer.match(/```sql\s*([\s\S]*)$/);

          if (completeMatch && completeMatch[1]) {
            setSqlQuery(completeMatch[1].trim());
          } else if (openMatch && openMatch[1]) {
            // It's still streaming, so update with what we have
            setSqlQuery(openMatch[1].trim());
          } else {
            // Fallback for no-markdown responses (e.g. raw SQL)
            let cleanTrimmed = streamBuffer.trim();
            // Remove Title line if present so it doesn't break SQL detection
            // Remove Title line if present so it doesn't break SQL detection
            cleanTrimmed = cleanTrimmed.replace(/^Title:.*(\r\n|\n|\r)?/im, '').trim();

            // Just check if it looks like SQL and doesn't contain a code block start yet
            if (/^(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(cleanTrimmed) && !cleanTrimmed.includes('```')) {
              setSqlQuery(cleanTrimmed);
            }
          }
        }
      }

      // Final Extraction & Validation
      let finalQuery = "";
      const sqlMatch = streamBuffer.match(/```sql\s*([\s\S]*?)```/);
      if (sqlMatch && sqlMatch[1]) {
        finalQuery = sqlMatch[1].trim();
      } else {
        let cleanTrimmed = streamBuffer.trim();
        // Remove Title line if present so it doesn't break SQL detection
        // Remove Title line if present so it doesn't break SQL detection
        cleanTrimmed = cleanTrimmed.replace(/^Title:.*(\r\n|\n|\r)?/im, '').trim();

        if (/^(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(cleanTrimmed)) {
          finalQuery = cleanTrimmed;
        }
      }

      // PARANOID CLEANUP: Ensure Title is stripped from finalQuery regardless of how it was extracted
      if (finalQuery) {
        finalQuery = finalQuery.replace(/(^|\n)Title:.*?(\r\n|\n|$)/gim, '').trim();
      }

      if (finalQuery) {
        setSqlQuery(finalQuery);

        // Auto-Execute Logic
        setTimeout(() => {
          if (queryEditorRef.current) {
            // We use the ref to trigger execution in the child
            // We pass finalQuery explicitly to ensure it runs the latest code
            queryEditorRef.current.runQuery(finalQuery);
          }
        }, 100);

        // Compute Diff
        try {
          const changes = Diff.diffLines(previousQuery || '', finalQuery);
          const newHighlights: number[] = [];
          let currentLine = 1;
          changes.forEach(part => {
            const lineCount = part.count || 0;
            if (part.added) {
              for (let i = 0; i < lineCount; i++) newHighlights.push(currentLine + i);
              currentLine += lineCount;
            } else if (!part.removed) {
              currentLine += lineCount;
            }
          });
          setHighlightedLines(newHighlights);
        } catch (diffErr) { console.error("Diff failed", diffErr); }
      } else {
        // NO SQL Found -> Unhide the message so user sees the text explanation
        setChatHistory(prev => {
          const newHist = [...prev];
          const last = newHist[newHist.length - 1];
          if (last.role === 'assistant') {
            last.hidden = false; // SHOW MESSAGE
          }
          return newHist;
        });
      }

      // Calculate Total Duration (Restoring missing logic)
      const endTime = performance.now();
      const durationSeconds = ((endTime - startTimeStr) / 1000).toFixed(2);

      setStatusMessage(`Success (${durationSeconds}s)`);
      setStatusType('success');
      setAiLoading(false);

      // Save History Turn to Backend
      const currentTitle = sessionTitle === 'Untitled Session' ? 'Untitled Session' : sessionTitle;

      // Clean the response: Remove "Title: ...\n" if it starts with it
      const cleanResponse = streamBuffer.replace(/^Title:.*\n+/, '');

      fetch('http://localhost:9000/api/history/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: currentTitle,
          prompt: userMsg,
          response: cleanResponse
        })
      }).catch(err => console.error("Failed to save history", err));

      // Mark success
      setChatHistory(prev => {
        const newHistory = [...prev];
        const lastIndex = newHistory.length - 1;
        if (lastIndex >= 0) {
          // Unhide the message so the <SQL> tag (rendered by AIChatSidebar) is visible
          if (newHistory[lastIndex].role === 'assistant') {
            newHistory[lastIndex].status = 'success';
            newHistory[lastIndex].hidden = false;
            newHistory[lastIndex].respTime = durationSeconds;
          }
        }
        // Mark USER message as success for checkmark
        for (let i = newHistory.length - 1; i >= 0; i--) {
          if (newHistory[i].role === 'user') {
            newHistory[i].status = 'success';
            break;
          }
        }
        return newHistory;
      });

    } catch (error: any) {
      console.error(error);
      setChatHistory(prev => {
        const newHist = [...prev];
        const last = newHist[newHist.length - 1];
        if (last.role === 'assistant') {
          last.content += `\n❌ Error: ${error.message || error}`;
          last.status = 'error';
          last.hidden = false; // SHOW ERROR
        } else {
          newHist.push({ role: 'assistant', content: `❌ Error: ${error.message || error}`, status: 'error', hidden: false });
        }
        return newHist;
      });
    } finally {
      setAiLoading(false);
      setAiStatus('idle'); // RESET STATUS
      // Clear specific AI status messages or set done
      setStatusMessage("AI Response Complete");
      setStatusType('success');
    }
  };

  // Helper for Tune AI - moved out to allow calling with explicit history
  const executeTuneAI = async (currentHistory: any[], userMsg: string, planTextOverride?: string) => {
    setAiLoading(true);
    setStatusMessage("Analyzing query plan...");
    setStatusType('info');

    try {
      const response = await fetch('http://localhost:9000/api/generate_sql_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg,
          schema_data: schema,
          history: currentHistory,
          model: selectedModel,
          connection: connectionInfo,
          plan_text: planTextOverride || explainText, // Use override if available
          sql_query: sqlQuery
        })
      });

      if (!response.ok || !response.body) throw new Error("Network error");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";

      // Append 'pending' assistant message
      setTuneChatHistory(prev => [...prev, { role: 'assistant', content: '...', status: 'pending' }]);

      let done = false;
      while (!done) {
        const { value, done: readDone } = await reader.read();
        done = readDone;
        if (value) {
          streamBuffer += decoder.decode(value, { stream: true });
          setTuneChatHistory(prev => {
            const newHist = [...prev];
            const lastIndex = newHist.length - 1;
            if (lastIndex >= 0 && newHist[lastIndex].role === 'assistant') {
              newHist[lastIndex] = { ...newHist[lastIndex], content: streamBuffer };
            }
            return newHist;
          });
        }
      }

      setTuneChatHistory(prev => {
        const newHist = [...prev];
        const last = newHist[newHist.length - 1];
        if (last.role === 'assistant') {
          last.status = 'success';
        }
        return newHist;
      });
      setStatusMessage("Analysis Complete");
      setStatusType('success');

    } catch (error: any) {
      console.error(error);
      setTuneChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
      setStatusMessage("Analysis Failed");
      setStatusType('error');
    } finally {
      // setAiLoading(false); // Handled in stream logic now to avoid premature disable
    }
  };

  // Tune AI Handler (User initiated)
  const handleTuneAIStream = async (userMsg: string) => {
    const newHistory: any[] = [...tuneChatHistory, { role: 'user', content: userMsg }];
    setTuneChatHistory(newHistory);
    await executeTuneAI(newHistory, userMsg);
  };



  // --- New Session Handler ---
  const handleNewSession = async () => {
    // 1. Save Full Session
    try {
      if (chatHistory.length > 0 || sqlQuery) {
        await fetch('http://localhost:9000/api/history/save_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: sessionTitle,
            sql: sqlQuery,
            history: chatHistory
          })
        });
      }
    } catch (e) {
      console.error("Auto-save on new session failed", e);
    }

    // 2. Clear UI
    setSqlQuery('');
    setChatHistory([]);
    setSessionTitle('Untitled Session');
    setExecutionResult(null);
    setExplainText(''); // Was setPlanText
    setAiStatus('idle');
    setStatusMessage(null);
  };

  // Persist SQL Query
  useEffect(() => {
    localStorage.setItem('pgray_sql_query', sqlQuery);
  }, [sqlQuery]);


  // Tab Selection
  const [activeAppTab, setActiveAppTab] = useState<'editor' | 'tune' | 'server'>('editor');
  const [tuneActiveSubTab, setTuneActiveSubTab] = useState<'plan' | 'text'>('plan');

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  // Selection
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const onNodeClick = useCallback((_event: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const [executionResult, setExecutionResult] = useState<any>(null); // For Tune Tab Results? 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Prefill editor with the last saved session (SQL + Chat History)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { getConnectionConfig } = await import('./api');

        // 1. Try to Load Connection Config
        const connRes = await getConnectionConfig();
        if (!cancelled && connRes && connRes.status === 'success' && connRes.data) {
          setConnectionInfo(connRes.data);
          setIsModalOpen(false);
          // Optional: Auto-connect check?
          import('./api').then(({ connectDb }) => {
            connectDb(connRes.data).catch(e => console.error("Auto-connect failed", e));
          });
        }

        // 2. Load Last Session
        // Auto-load last session removed as per user request
        // const res = await getLastSession();
        // if (!cancelled && res && res.data) {
        //   const { sql, history, title } = res.data;
        //   if (sql) setSqlQuery(sql);
        //   if (history) setChatHistory(history);
        //   if (title) setSessionTitle(title);
        // }
      } catch {
        // Ignore network errors on init
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);



  const handleRunExplain = async (analyze: boolean, getResults: boolean) => {
    if (!connectionInfo) {
      alert("No DB Connection!");
      return;
    }
    if (!sqlQuery) {
      alert("No Query!");
      return;
    }

    console.log("Running Explain...", { analyze, getResults });

    setLoading(true);
    setError('');

    // Switch to Tune Tab immediately
    setActiveAppTab('tune');
    setTuneActiveSubTab('plan'); // Show visual plan by default

    try {
      // Run Explain
      const res = await explainQuery(connectionInfo, sqlQuery, analyze);
      console.log("Explain Result", res);

      // Backend returns { status: "success", data: { json: [...], text: "..." } }
      // res is the response body. res.data is the payload.
      if (res.data && res.data.json && res.data.json.length > 0) {
        const rawPlan = res.data.json;
        // Logic to find plan root
        let planRoot = rawPlan[0]['QUERY PLAN'] || rawPlan[0]['Plan'];
        if (!planRoot && Array.isArray(rawPlan)) planRoot = rawPlan; // fallback

        setExplainResult(rawPlan);

        // Parse View
        const { nodes: newNodes, edges: newEdges } = parsePlanToFlow(planRoot);
        setNodes(newNodes);
        setEdges(newEdges);

        // Text Plan
        if (res.data.text) {
          setExplainText(res.data.text);
        } else {
          setExplainText(JSON.stringify(rawPlan, null, 2));
        }
      }

      // Auto-Fit View
      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2 });
        }
      }, 500);

      // Auto-Fit View
      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2 });
        }
      }, 500);

      // Prepare Plan Text for AI
      let currentPlanText = "";
      if (res.data.text) {
        currentPlanText = res.data.text;
      } else if (res.data.json) {
        currentPlanText = JSON.stringify(res.data.json, null, 2);
      }

      // Automated AI Analysis
      setTuneChatHistory([]); // Clear previous history
      const analysisPrompt = "Analyze this query plan. 1) which nodes take the most amount of time and why. 2) what optimizations are availble.";

      const initialHistory = [{ role: 'user', content: analysisPrompt }];
      // We set state for UI, but pass 'initialHistory' to function for logic
      setTuneChatHistory(initialHistory as any); // Cast to fix type mismatch if any

      // Execute AI
      // We don't await this so UI doesn't block? 
      // Actually we are in async function, but we want to exit loading state?
      // No, setAiLoading is handled in executeTuneAI.
      // But we turned off 'setLoading(false)' in finally block of THIS function.
      // separate loading states: loading (Explain execution), aiLoading (AI).
      // setLoading(false) runs in finally.
      // executeTuneAI sets aiLoading(true).
      // So Explain finishes -> loading=false. AI starts -> aiLoading=true.
      executeTuneAI(initialHistory, analysisPrompt, currentPlanText);

      // Check for improvement comparison
      if (previousTimeRef.current !== null && res.data && res.data.json) {
        const newTime = getExecutionTime(res.data.json);
        if (newTime > 0) {
          const oldTime = previousTimeRef.current;
          const diff = oldTime - newTime;
          const percent = ((diff / oldTime) * 100).toFixed(1);
          const faster = (oldTime / newTime).toFixed(1);

          let msg = `Plan Refreshed!\n\nExecution Time: ${oldTime.toFixed(2)}ms -> ${newTime.toFixed(2)}ms`;
          if (diff > 0) {
            msg += `\n\n🚀 Improved by ${percent}% (${faster}x faster)!`;
          } else {
            msg += `\n\n(No significant improvement detected)`;
          }
          alert(msg);
        }
        previousTimeRef.current = null; // Reset
      }

    } catch (err: any) {
      console.error("Explain Failed", err);
      setError(err.message || "Explain Failed");
    } finally {
      setLoading(false);
    }
  };


  const handleVisualizeJson = async (jsonStr: string) => {
    try {
      const plan = JSON.parse(jsonStr);
      const { nodes: flowNodes, edges: flowEdges } = parsePlanToFlow(plan);
      setNodes(flowNodes);
      setEdges(flowEdges);
      setExplainResult([{ 'QUERY PLAN': plan }]);
      setExplainText(JSON.stringify(plan, null, 2));
      setActiveAppTab('tune');
    } catch (e) {
      console.error("Invalid JSON", e);
    }
  };


  const handleConnectionDecode = (conn: any) => {
    setConnectionInfo(conn);
    setIsModalOpen(false);
    connectDb(conn).then(() => {
      // Connected
    }).catch(e => alert("Connection Failed: " + e.message));
  };


  const nodeTypes = useMemo(() => ({ planNode: PlanNode }), []);

  // Ref to store previous execution time for comparison
  const previousTimeRef = useRef<number | null>(null);

  // Helper to extract execution time (ms) from plan
  const getExecutionTime = (plan: any) => {
    if (!plan) return 0;
    // Postgres JSON format usually has "Execution Time" or "Total Runtime" at root
    // But our plan might be [ { "Plan": ..., "Execution Time": ... } ]
    const root = Array.isArray(plan) ? plan[0] : plan;
    return root['Execution Time'] || root['Total Runtime'] || 0;
  };

  const handleRunSql = async (sql: string) => {
    // Basic confirmation as running arbitrary SQL is risky
    if (!confirm("Run this SQL command?\n\n" + sql)) return;

    try {
      setLoading(true);

      // 1. Capture current performance if we are in Tune mode and have a result
      if (activeAppTab === 'tune' && explainResult) {
        const time = getExecutionTime(explainResult);
        if (time > 0) previousTimeRef.current = time;
      }

      const { executeQuery } = await import('./api');
      await executeQuery(connectionInfo, sql, 1); // Limit 1 just in case

      // 2. Auto-Refresh Plan if in Tune Mode
      if (activeAppTab === 'tune') {
        // alert("Command executed! Refreshing plan..."); // Too noisy? User wanted auto.
        // Let's rely on the Comparison Toast to confirm success.
        await handleRunExplain(true, false);
      } else {
        alert("Command executed successfully!");
      }

    } catch (e: any) {
      alert("Execution Failed: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // New handler for simply loading SQL
  const handleLoadSql = (sql: string) => {
    setSqlQuery(sql);
    setActiveAppTab('editor');
  };




  useEffect(() => {
    // Only auto-clear if it's NOT a persistent state like 'thinking' or 'executing'
    // We can interpret 'info' as persistent if we want, or add a specific type?
    // User said: "executing query", "Thinking...", "Processing..."
    // Let's use specific messages or regex, or better: separate 'loading' state?
    // Simple approach: auto-clear success/error/warning, but keep 'info' if it looks like progress?
    // Actually, 'executing query' is passed as 'info'.
    // Let's rely on the caller to clear persistent states (e.g. by setting success/error).
    // So ONLY auto-clear success, warning, error. Info stays until changed?
    // User said: "display it for 30 secs and then clear it" -> likely meant notifications.
    // But for "Thinking...", it should stay until done.

    if (statusMessage) {
      if (['success', 'warning', 'error'].includes(statusType)) {
        const timer = setTimeout(() => {
          setStatusMessage(null);
        }, 5000); // 5s as requested last time
        return () => clearTimeout(timer);
      }
    }
  }, [statusMessage, statusType]);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f172a' }}>

      {/* 3. Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'row' }}>


        {/* Tab 1: Editor */}
        <div style={{ height: '100%', flex: 1, display: activeAppTab === 'editor' ? 'block' : 'none', minWidth: 0 }}>
          <QueryEditorTab
            ref={queryEditorRef} // Attach Ref to Child
            connectionInfo={connectionInfo}
            sqlQuery={sqlQuery}
            setSqlQuery={setSqlQuery}
            onRun={() => handleRunExplain(true, false)}
            onNewSession={handleNewSession}

            // Lifted Props
            chatHistory={chatHistory}
            setChatHistory={setChatHistory} // Added
            sessionTitle={sessionTitle}
            setSessionTitle={setSessionTitle}
            schema={schema}
            loadingSchema={loadingSchema}
            onTune={() => {
              handleRunExplain(true, false);
            }}

            highlightedLines={highlightedLines}
            diffBaseQuery={diffBaseQuery} // Added
            onPlanUpdate={(planData: any) => {
              console.log("App: onPlanUpdate received", planData);
              // Reusing logic from handleRunExplain somewhat, but dealing with raw data
              if (planData && planData.length > 0) {
                const rawPlan = planData;
                let planRoot = rawPlan[0]['QUERY PLAN'] || rawPlan[0]['Plan'];
                if (!planRoot && Array.isArray(rawPlan)) planRoot = rawPlan;

                setExplainResult(rawPlan);
                const { nodes: newNodes, edges: newEdges } = parsePlanToFlow(planRoot);
                setNodes(newNodes);
                setEdges(newEdges);

                if (planData.text) {
                  setExplainText(planData.text);
                } else {
                  setExplainText(JSON.stringify(rawPlan, null, 2));
                }
              }
            }}
            onStatusChange={(msg, type) => {
              setStatusMessage(msg);
              setStatusType(type || 'info');
            }}
            showDiff={showDiff}
            setShowDiff={setShowDiff}
          />
        </div>

        {/* Tab 2: Tune */}
        <div style={{ height: '100%', flex: 1, display: activeAppTab === 'tune' ? 'block' : 'none', minWidth: 0 }}>
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
            explainText={explainText} // Added
            executionResult={executionResult}
            loading={loading}
            error={error}
            sqlQuery={sqlQuery}
            flowWrapperRef={flowWrapperRef}
            reactFlowInstance={reactFlowInstance}
            setReactFlowInstance={setReactFlowInstance}
            onVisualizeJson={handleVisualizeJson}
            nodeTypes={nodeTypes}
            onBack={() => setActiveAppTab('editor')}
            // Tune AI Props
            chatHistory={tuneChatHistory}
            onChatSend={handleTuneAIStream}
            aiLoading={aiLoading}
            isVisible={activeAppTab === 'tune'}
            onRunSql={handleRunSql}
            onRefreshPlan={() => handleRunExplain(true, false)}
          />
        </div>

        {/* Tab 3: Server */}
        <div style={{ height: '100%', flex: 1, display: activeAppTab === 'server' ? 'block' : 'none', minWidth: 0 }}>
          <ServerTuneTab connectionInfo={connectionInfo} />
        </div>

        {/* Global AI Chat Sidebar (Docked Right) */}
        {isSidebarOpen && activeAppTab !== 'tune' && (
          <div style={{ width: '300px', flexShrink: 0, height: '100%', borderLeft: '1px solid #334155' }}>
            <AIChatSidebar
              messages={chatHistory}
              onClose={() => setIsSidebarOpen(false)}
              onSend={handleAIStream}
              loading={aiLoading}
              aiState={aiStatus} // Pass AI Status
              onRunSql={handleLoadSql} // Use Load handler instead of Run handler for chat clicks
              onDiff={handleDiff}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>
        )}


      </div>

      {/* Status Bar */}
      <StatusBar message={statusMessage} type={statusType} />

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
        onSelectQuery={(query: any) => {
          setSqlQuery(query.sql_query || query.sql || ''); // Handle various potential names or just cast
          setActiveAppTab('editor');
        }}
      />

    </div>
  );
}

export default App;
