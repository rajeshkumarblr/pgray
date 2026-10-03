import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Node } from 'reactflow';
import { format as formatSql } from 'sql-formatter';
import SavedQueriesSidebar from './workspace/SavedQueriesSidebar';
import AIChatSidebar from './AIChatSidebar';
import EditorToolbar from './EditorToolbar';
import BottomPane from './workspace/BottomPane';
import SimpleEditor from './SimpleEditor';
import DiffView from './DiffView';
import PlanNode from './PlanNode';
import NodeDetailsPanel from './NodeDetailsPanel';
import { getSavedQueries, ParameterizedQuery, explainSql, simulateIndex, runAdminAction, generateSql } from '../api';
import { parsePlanToFlow } from '../utils/planLayout';


import AskTab from '../pages/AskTab';
import AdminTab from './tabs/AdminTab';
import DesignTab from './tabs/DesignTab';
import QueryTuneTab from './tabs/QueryTuneTab';
import { Sparkles, Code, GitBranch, Settings, MessageSquare, Info, Database, Cpu } from 'lucide-react';


const nodeTypes = { planNode: PlanNode };

interface QueryWorkspaceProps {
    connectionInfo: any;
    sqlQuery: string;
    setSqlQuery: (q: string) => void;
    schema: any;
    loadingSchema: boolean;
    sessionTitle: string;
    setSessionTitle: (t: string) => void;
    onLoadSession: (name: string) => void;
    onNewSession: () => void;
    onSaveSession: () => Promise<void>;
    onExecute: (sql?: string, params?: any) => void;
    isExecuting: boolean;
    executionResult: any;
    execError?: string | null;
    onSyncFromAsk?: (sql: string, result: any, title?: string) => void;
    onTune: (params?: any, sqlOverride?: string) => void;
    explainResult: any;
    explainText: string;
    loadingExplain: boolean;
    explainError: string;
    selectedNode: any;
    setSelectedNode: (node: any) => void;
    nodes: any[];
    edges: any[];
    onNodesChange: any;
    onNodeClick: any;
    onPaneClick: any;
    diffBaseQuery: string;
    showDiff: boolean;
    setShowDiff: (b: boolean) => void;
    onCopy: () => void;
    onReset: () => void;
    onAnalyzeNode: (node: Node) => void;
    insights: any[];
    onRunInsight: (id: string, sql: string) => void;
    insightResults: any;
    onCompare: () => void;
    baselineMetrics: { planning: number, execution: number } | null;
    queriesRefreshTrigger: number;
    activeTab: 'ask' | 'query' | 'design' | 'admin';
    setActiveTab: (tab: 'ask' | 'query' | 'design' | 'admin') => void;
    onAnalyzeParamQuery: (sql: string) => void;
    onEdit: (sql: string, name: string) => void;
    onOpenSettings?: () => void;
    highlightedLines?: number[];
    onAskAI: (prompt: string) => void;
    onAppSearch: (prompt: string) => void;
    // AI Sidebar Props
    chatHistory: { role: 'user' | 'assistant', content: string, status?: 'success' | 'error' | 'pending', hidden?: boolean, respTime?: string, ttft?: string, planTime?: string, execTime?: string }[];
    onAIStream: (userMsg: string, displayMsg?: string, isAnalysis?: boolean) => void;
    aiLoading: boolean;
    aiStatus: 'idle' | 'thinking' | 'generating';
    activeProvider: string;
    setActiveProvider: (provider: string) => void;
    googleApiKey: string;
    setGoogleApiKey: (key: string) => void;
    onClearHistory: () => void;
    onIndexDatabase: () => void;
    localModel: string;
    geminiModel: string;
    setLocalModel: (m: string) => void;
    setGeminiModel: (m: string) => void;
}

const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({
    connectionInfo, sqlQuery, setSqlQuery, schema, loadingSchema,
    sessionTitle, setSessionTitle, onLoadSession, onNewSession, onSaveSession,
    onExecute, isExecuting, executionResult, execError, onSyncFromAsk,
    onTune, explainResult, explainText, loadingExplain, explainError,
    selectedNode, setSelectedNode,
    nodes, edges, onNodesChange, onNodeClick, onPaneClick,
    diffBaseQuery, showDiff, setShowDiff,
    onCopy, onReset, onAnalyzeNode,
    insights, onRunInsight, insightResults,
    onCompare, baselineMetrics, queriesRefreshTrigger,
    activeTab, setActiveTab, onAnalyzeParamQuery, onEdit,
    onOpenSettings, onAskAI, onAppSearch, highlightedLines = [],
    // AI Sidebar Props
    chatHistory, onAIStream, aiLoading, aiStatus,
    activeProvider, setActiveProvider, googleApiKey, setGoogleApiKey,
    onClearHistory, onIndexDatabase,
    localModel, geminiModel, setLocalModel, setGeminiModel
}) => {

    // --- AI Sidebar State ---
    const [aiSidebarWidth, setAiSidebarWidth] = useState(380);
    const [activeRightTab, setActiveRightTab] = useState<'chat' | 'details'>('chat');


    // --- Local State ---
    const [savedQueries, setSavedQueries] = useState<ParameterizedQuery[]>([]);
    const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'insights'>('results');
    const [bottomExpanded, setBottomExpanded] = useState(false);
    const [bottomHeight, setBottomHeight] = useState(280);
    const [isBottomMaximized, setIsBottomMaximized] = useState(false);
    const [tuneTabMode, setTuneTabMode] = useState<'visual' | 'text' | 'compare'>('visual');
    const [paramValues, setParamValues] = useState<Record<string, string>>({});

    // Split View State
    const [showPlan, setShowPlan] = useState(false);
    const [planWidth, setPlanWidth] = useState(560); // Default width for Plan pane

    // What-If Index Simulation State
    const [simulationResult, setSimulationResult] = useState<any | null>(null);
    const [simulatingIndex, setSimulatingIndex] = useState(false);
    const [simulatedNodes, setSimulatedNodes] = useState<any[] | null>(null);
    const [simulatedEdges, setSimulatedEdges] = useState<any[] | null>(null);

    // Clear simulation when SQL query changes
    useEffect(() => {
        setSimulationResult(null);
        setSimulatedNodes(null);
        setSimulatedEdges(null);
    }, [sqlQuery]);

    // Auto-Trigger Explain Plan Logic
    useEffect(() => {
        if (activeTab === 'query' && showPlan && sqlQuery && !explainResult) {
            onTune(null, sqlQuery);
        }
    }, [activeTab, showPlan, explainResult, sqlQuery]);

    // Lifted Search State
    const [searchPrompt, setSearchPrompt] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [pendingParams, setPendingParams] = useState<any[]>([]);

    // Recent Searches State
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    // SQL Explanation State for Search Tab
    const [sqlExplanation, setSqlExplanation] = useState<string | null>(null);
    const explainReqIdRef = useRef<number>(0);

    // --- Load Saved Queries ---
    const [loadingSavedQueries, setLoadingSavedQueries] = useState(false);

    const loadSavedQueries = useCallback(() => {
        if (connectionInfo) {
            setLoadingSavedQueries(true);
            getSavedQueries(connectionInfo)
                .then(res => {
                    if (res && res.parameterized) {
                        setSavedQueries(res.parameterized);
                    } else {
                        setSavedQueries([]);
                    }
                })
                .catch(err => {
                    console.error("Failed to load queries", err);
                    setSavedQueries([]);
                })
                .finally(() => setLoadingSavedQueries(false));
        }
    }, [connectionInfo]);

    useEffect(() => {
        loadSavedQueries();
    }, [loadSavedQueries, queriesRefreshTrigger]);

    // Auto-collapse bottom pane logic
    useEffect(() => {
        if (!['query', 'ask'].includes(activeTab)) {
            setBottomExpanded(false);
        }
    }, [activeTab]);

    // --- Handlers ---

    const handleSelectSavedQuery = (query: ParameterizedQuery) => {
        setSqlQuery(query.sql);
        setSessionTitle(query.name);
        setSearchPrompt(query.name);
        setShowSearchResults(false);

        if (activeTab === 'ask') {
            setActiveTab('query');
        }

        if (query.params && query.params.length > 0) {
            setPendingParams(query.params);
        } else {
            setPendingParams([]);
            setParamValues({});
            onExecute(query.sql);
            setActiveBottomTab('results');
            setBottomExpanded(true);
        }
    };

    const handleExecuteWrapper = (selectedSql?: string) => {
        const targetSql = typeof selectedSql === 'string' && selectedSql.trim() ? selectedSql : sqlQuery;
        onExecute(targetSql, paramValues);
        setActiveBottomTab('results');
        setBottomExpanded(true);
    };

    const handleFormatSql = () => {
        if (!sqlQuery.trim()) return;
        try {
            const formatted = formatSql(sqlQuery, {
                language: 'postgresql',
                keywordCase: 'upper',
                tabWidth: 2,
            });
            setSqlQuery(formatted);
        } catch (e) {
            console.warn('SQL formatting failed, keeping original SQL:', e);
        }
    };

    const handleInlineAI = async (instruction: string, currentSql: string): Promise<string | null> => {
        const activeModel = activeProvider === 'local' ? localModel : geminiModel;
        const prompt = currentSql.trim()
            ? `Modify the following PostgreSQL query according to this request: "${instruction}". Return ONLY the valid PostgreSQL SQL query.\n\nExisting SQL:\n\`\`\`sql\n${currentSql}\n\`\`\``
            : instruction;
        const res = await generateSql(prompt, schema, [], activeModel, connectionInfo, '', currentSql);
        const rawText = res?.response || res?.sql || '';
        const blockMatch = rawText.match(/```(?:sql)?\s*([\s\S]*?)```/i);
        const extracted = (blockMatch ? blockMatch[1] : rawText).trim();
        return extracted || null;
    };

    const handleSimulateIndex = async (indexSql: string) => {
        if (!connectionInfo || !sqlQuery.trim() || !indexSql.trim()) return;
        setActiveTab('query');
        setShowPlan(true);
        setTuneTabMode('visual');
        setSimulatingIndex(true);
        try {
            const res = await simulateIndex(connectionInfo, sqlQuery, indexSql, true);
            if (res?.data) {
                setSimulationResult(res.data);
                const simJson = res.data.simulated_json;
                const planRoot = Array.isArray(simJson) && simJson.length > 0
                    ? (simJson[0]['QUERY PLAN'] || simJson[0]['Plan'])
                    : simJson;
                if (planRoot) {
                    const { nodes: sNodes, edges: sEdges } = parsePlanToFlow(planRoot);
                    setSimulatedNodes(sNodes);
                    setSimulatedEdges(sEdges);
                }
            }
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Index simulation failed';
            alert(`Simulation Error: ${msg}`);
        } finally {
            setSimulatingIndex(false);
        }
    };

    const handleApplyIndex = async (indexSql: string) => {
        if (!connectionInfo || !indexSql.trim()) return;
        try {
            await runAdminAction(connectionInfo, 'create_index', '', indexSql);
            setSimulationResult(null);
            setSimulatedNodes(null);
            setSimulatedEdges(null);
            setShowPlan(true);
            onTune(null, sqlQuery);
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Failed to create index';
            alert(`Create Index Error: ${msg}`);
        }
    };

    const handleClearSimulation = () => {
        setSimulationResult(null);
        setSimulatedNodes(null);
        setSimulatedEdges(null);
    };

    const handleRunMaintenance = async (action: 'analyze' | 'vacuum_analyze', tableName: string) => {
        if (!connectionInfo || !tableName) return;
        await runAdminAction(connectionInfo, action, tableName);
        if (showPlan && sqlQuery) {
            onTune(null, sqlQuery);
        }
    };

    // Handler for opening Visual Plan (carries over SQL & results from Ask if provided)
    const handleTuneWrapper = (sqlOverride?: string, resultOverride?: any) => {
        const targetSql = sqlOverride || sqlQuery;
        if (sqlOverride) {
            setSqlQuery(sqlOverride);
        }
        if (onSyncFromAsk && (sqlOverride || resultOverride !== undefined)) {
            onSyncFromAsk(targetSql, resultOverride);
        }
        if (resultOverride || executionResult) {
            setActiveBottomTab('results');
            setBottomExpanded(true);
        }
        setTuneTabMode('visual');
        setActiveTab('query');
        setShowPlan(true); // Open Plan Pane
        if (targetSql) {
            onTune(null, targetSql); // Trigger Plan with targetSql immediately
        }
    };

    // Handler for toggling Plan pane
    const handleTogglePlan = () => {
        const nextShow = !showPlan;
        setShowPlan(nextShow);
        if (nextShow && sqlQuery) {
            onTune(null, sqlQuery);
        }
    };

    // Handler for explaining SQL logic in plain English (race-safe)
    const handleExplainLogic = useCallback(async (sqlOverride?: string) => {
        const targetSql = sqlOverride || sqlQuery;
        if (!targetSql) return;
        const reqId = ++explainReqIdRef.current;
        setSqlExplanation(null); // Clear previous to trigger loading state in UI
        try {
            const activeModel = activeProvider === 'local' ? localModel : geminiModel;
            const res = await explainSql(targetSql, schema, activeModel);
            if (reqId !== explainReqIdRef.current) return; // Ignore stale response
            if (res && res.response) {
                setSqlExplanation(res.response);
            } else if (res && res.explanation) {
                setSqlExplanation(res.explanation);
            }
        } catch (e) {
            if (reqId !== explainReqIdRef.current) return;
            console.error("Failed to explain query", e);
            setSqlExplanation("Failed to generate explanation. Please try again.");
        }
    }, [sqlQuery, schema, activeProvider, localModel, geminiModel]);

    const startBottomResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = bottomHeight;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newHeight = startHeight - (moveEvent.clientY - startY);
            if (newHeight >= 100 && newHeight <= 800) {
                setBottomHeight(newHeight);
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const startAISidebarResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = aiSidebarWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = startWidth - (moveEvent.clientX - startX);
            if (newWidth >= 300 && newWidth <= 800) {
                setAiSidebarWidth(newWidth);
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // Plan Pane Resize
    const startPlanResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = planWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            // Dragging left increases width
            const newWidth = startWidth + (startX - moveEvent.clientX);
            if (newWidth >= 300 && newWidth <= 1200) {
                setPlanWidth(newWidth);
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // Node Click Handler Wrapper
    const handleNodeClickWrapper = (e: React.MouseEvent, node: Node) => {
        if (onNodeClick) onNodeClick(e, node);
        setActiveRightTab('details'); // Switch right tab to details
    };

    const isMacElectron = typeof navigator !== 'undefined' &&
        navigator.userAgent.includes('Electron') &&
        navigator.platform.toLowerCase().includes('mac');

    // Tab Style Helper
    const tabStyle = (tab: 'ask' | 'query' | 'design' | 'admin') => ({
        padding: '0 16px',
        height: '100%',
        cursor: 'pointer',
        color: activeTab === tab ? '#f8fafc' : '#94a3b8',
        borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
        background: activeTab === tab ? 'rgba(30, 41, 59, 0.75)' : 'transparent',
        fontWeight: activeTab === tab ? 600 : 500,
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        userSelect: 'none' as any,
        WebkitAppRegion: 'no-drag' as any,
        transition: 'all 0.15s ease'
    });

    // Right Sidebar Tab Style
    const rightTabStyle = (tab: 'chat' | 'details') => ({
        flex: 1,
        padding: '8px',
        textAlign: 'center' as const,
        cursor: 'pointer',
        color: activeRightTab === tab ? '#e2e8f0' : '#94a3b8',
        borderBottom: activeRightTab === tab ? '2px solid #3b82f6' : '1px solid #334155',
        background: activeRightTab === tab ? '#0f172a' : '#1e293b',
        fontSize: '12px',
        fontWeight: activeRightTab === tab ? 600 : 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
    });

    const activeModelLabel = activeProvider === 'local'
        ? (localModel.includes('gemma4') ? 'LiteRT • Gemma4-2B' : `Local • ${localModel}`)
        : `Gemini • ${geminiModel}`;

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>

            {/* Main Center Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0f172a' }}>

                {/* 1. Native macOS Unified Titlebar + Navigation Row */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        height: '40px',
                        background: '#0f172a',
                        borderBottom: '1px solid #1e293b',
                        paddingLeft: isMacElectron ? '82px' : '8px',
                        paddingRight: '12px',
                        WebkitAppRegion: 'drag',
                        userSelect: 'none'
                    } as React.CSSProperties}
                >
                    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <div onClick={() => setActiveTab('ask')} style={tabStyle('ask')}>
                            <Sparkles size={15} className={activeTab === 'ask' ? 'text-blue-400' : ''} /> Ask
                        </div>
                        <div onClick={() => setActiveTab('query')} style={tabStyle('query')}>
                            <Code size={15} className={activeTab === 'query' ? 'text-blue-400' : ''} /> Query
                        </div>
                        <div onClick={() => setActiveTab('design')} style={tabStyle('design')}>
                            <GitBranch size={15} className={activeTab === 'design' ? 'text-blue-400' : ''} /> Design
                        </div>
                        <div onClick={() => setActiveTab('admin')} style={tabStyle('admin')}>
                            <Settings size={15} className={activeTab === 'admin' ? 'text-blue-400' : ''} /> Admin
                        </div>
                    </div>

                    {/* Right Status Pills (Connection & AI Engine) */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            WebkitAppRegion: 'no-drag'
                        } as React.CSSProperties}
                    >
                        <button
                            onClick={onOpenSettings}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors"
                            title="PostgreSQL Connection Settings"
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${connectionInfo?.database ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                            <Database size={11} className="text-slate-400" />
                            <span className="font-mono text-[11px]">
                                {connectionInfo ? `${connectionInfo.host || 'localhost'}:${connectionInfo.port || 5432}/${connectionInfo.database || 'postgres'}` : 'Connect DB'}
                            </span>
                        </button>

                        <button
                            onClick={onOpenSettings}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-purple-300 transition-colors"
                            title="AI Model Settings"
                        >
                            <Cpu size={11} className="text-purple-400" />
                            <span className="text-[11px] font-medium">{activeModelLabel}</span>
                        </button>
                    </div>
                </div>

                {/* 2. Content Area */}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>

                    {activeTab === 'ask' && (
                        <AskTab
                            onSearch={onAppSearch}
                            isExecuting={isExecuting}
                            result={executionResult}
                            error={execError || null}
                            generatedSql={sqlQuery}
                            promptValue={searchPrompt}
                            onPromptChange={setSearchPrompt}
                            showResults={showSearchResults}
                            onShowResults={setShowSearchResults}

                            savedQueries={savedQueries}
                            recentSearches={recentSearches}
                            onSelectQuery={(q) => {
                                if (typeof q === 'string') {
                                    setSearchPrompt(q);
                                    setShowSearchResults(true);
                                    onAppSearch(q);
                                } else {
                                    handleSelectSavedQuery(q);
                                }
                            }}

                            sqlExplanation={sqlExplanation}
                            onExplainLogic={handleExplainLogic}
                            onClearExplanation={() => {
                                explainReqIdRef.current++;
                                setSqlExplanation(null);
                            }}
                            onSyncState={(sql, res, promptText) => {
                                if (sql) setSqlQuery(sql);
                                if (res !== undefined && onSyncFromAsk) {
                                    onSyncFromAsk(sql, res, promptText);
                                }
                                if (res) {
                                    setBottomExpanded(true);
                                    setActiveBottomTab('results');
                                }
                            }}
                            onTune={(sql, res) => handleTuneWrapper(sql, res)}
                            onEditSql={(sql, res) => {
                                if (sql) setSqlQuery(sql);
                                if (res !== undefined && onSyncFromAsk) {
                                    onSyncFromAsk(sql || sqlQuery, res);
                                }
                                if (res || executionResult) {
                                    setBottomExpanded(true);
                                    setActiveBottomTab('results');
                                }
                                setActiveTab('query');
                            }}
                            connectionInfo={connectionInfo}
                            model={activeProvider === 'local' ? localModel : geminiModel}
                        />
                    )}

                    {activeTab === 'query' && (
                        <div style={{ display: 'flex', flexDirection: 'row', height: '100%', overflow: 'hidden' }}>

                            {/* Left Sidebar (Schema Explorer & Saved Queries) */}
                            <SavedQueriesSidebar
                                connectionInfo={connectionInfo}
                                onSelectQuery={handleSelectSavedQuery}
                                queries={savedQueries}
                                loading={loadingSavedQueries}
                                onReload={loadSavedQueries}
                                activeQueryName={sessionTitle}
                                schema={schema}
                                onPreviewTable={(tableName) => {
                                    const previewSql = `SELECT *\nFROM ${tableName}\nLIMIT 50;`;
                                    setSqlQuery(previewSql);
                                    setSessionTitle(`Preview: ${tableName}`);
                                    handleExecuteWrapper(previewSql);
                                }}
                                onInsertSnippet={(snippet) => {
                                    setSqlQuery(sqlQuery ? `${sqlQuery} ${snippet}` : snippet);
                                }}
                            />

                            {/* Center Area (Code/Plan + BottomPane) */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

                                {/* Top Content: Split View (Code | Plan) */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
                                    {/* Left Split: Code Editor */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                                        <EditorToolbar
                                            sessionTitle={sessionTitle}
                                            connectionInfo={connectionInfo}
                                            onExecute={() => handleExecuteWrapper()}
                                            isExecuting={isExecuting}
                                            onStop={() => { }}
                                            onClear={onReset}
                                            onFormat={handleFormatSql}
                                            onSave={onSaveSession}
                                            onExplain={() => {
                                                setTuneTabMode('text');
                                                setShowPlan(true);
                                                onTune(null, sqlQuery);
                                            }}
                                            onAskAI={() => {
                                                setActiveRightTab('chat');
                                                if (sqlQuery.trim()) {
                                                    onAIStream(
                                                        `Explain what this PostgreSQL query does and suggest any indexing or performance improvements:\n\`\`\`sql\n${sqlQuery}\n\`\`\``,
                                                        'Analyze & explain current SQL query',
                                                        true
                                                    );
                                                }
                                            }}
                                            onOpenSettings={onOpenSettings}
                                            showPlan={showPlan}
                                            onTogglePlan={handleTogglePlan}
                                        />

                                        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
                                            <SimpleEditor
                                                value={sqlQuery}
                                                onChange={setSqlQuery}
                                                schema={schema}
                                                onExecute={handleExecuteWrapper}
                                                onInlineAI={handleInlineAI}
                                                style={{ height: '100%', flex: 1 }}
                                            />
                                            {/* Diff View Overlay */}
                                            {showDiff && (
                                                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', background: '#0f172a', borderLeft: '1px solid #334155', zIndex: 10 }}>
                                                    <DiffView
                                                        oldCode={diffBaseQuery}
                                                        newCode={sqlQuery}
                                                        onClose={() => setShowDiff(false)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Split: Plan (Conditional) */}
                                    {showPlan && (
                                        <>
                                            {/* Resize Handle */}
                                            <div
                                                onMouseDown={startPlanResize}
                                                style={{
                                                    width: '5px',
                                                    cursor: 'col-resize',
                                                    background: '#1e293b',
                                                    borderLeft: '1px solid #334155',
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    zIndex: 20
                                                }}
                                            >
                                                <div style={{ width: '2px', height: '30px', background: '#475569', borderRadius: '2px' }} />
                                            </div>

                                            <div style={{ width: `${planWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
                                                <QueryTuneTab
                                                    activeTab={tuneTabMode}
                                                    setActiveTab={setTuneTabMode}
                                                    nodes={simulatedNodes || nodes}
                                                    edges={simulatedEdges || edges}
                                                    onNodesChange={onNodesChange}
                                                    onNodeClick={handleNodeClickWrapper}
                                                    onPaneClick={onPaneClick}
                                                    selectedNode={selectedNode}
                                                    explainResult={simulationResult?.simulated_json || explainResult}
                                                    explainText={simulationResult?.simulated_text || explainText}
                                                    loading={loadingExplain || simulatingIndex}
                                                    error={explainError}
                                                    setReactFlowInstance={() => { }}
                                                    nodeTypes={nodeTypes}
                                                    onAnalyzeNode={(node) => {
                                                        setActiveRightTab('chat');
                                                        onAnalyzeNode(node);
                                                    }}
                                                    onRefreshPlan={() => onTune(null, sqlQuery)}
                                                    onCompare={onCompare}
                                                    baselineMetrics={baselineMetrics}
                                                    onClose={() => setShowPlan(false)}
                                                    onSimulateIndex={handleSimulateIndex}
                                                    onApplyIndex={handleApplyIndex}
                                                    simulationResult={simulationResult}
                                                    onClearSimulation={handleClearSimulation}
                                                    simulatingIndex={simulatingIndex}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Bottom Pane (Results) - Now Full Width within Center Area */}
                                {!isBottomMaximized && (
                                    <div
                                        onMouseDown={startBottomResize}
                                        style={{
                                            height: '5px',
                                            cursor: 'row-resize',
                                            background: '#1e293b',
                                            borderTop: '1px solid #334155',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ width: '30px', height: '2px', background: '#475569', borderRadius: '2px' }} />
                                    </div>
                                )}

                                <BottomPane
                                    activeTab={activeBottomTab}
                                    setActiveTab={setActiveBottomTab}
                                    executionResult={executionResult}
                                    execError={execError}
                                    height={bottomHeight}
                                    isExpanded={bottomExpanded}
                                    onToggleExpand={() => setBottomExpanded(!bottomExpanded)}
                                    isMaximized={isBottomMaximized}
                                    onToggleMaximize={() => setIsBottomMaximized(!isBottomMaximized)}
                                    insights={insights}
                                    onRunInsight={onRunInsight}
                                    insightResults={insightResults}
                                    sqlQuery={sqlQuery}
                                    paramValues={paramValues}
                                    onParamChange={setParamValues}
                                    connectionInfo={connectionInfo}
                                    metaParams={[]}
                                    onExecuteQuery={() => handleExecuteWrapper()}
                                />

                            </div>

                            {/* Right Sidebar: AI Assistant / Node Details */}
                            <div
                                onMouseDown={startAISidebarResize}
                                style={{
                                    width: '5px',
                                    cursor: 'col-resize',
                                    background: '#1e293b',
                                    borderLeft: '1px solid #334155',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                            >
                                <div style={{ width: '2px', height: '30px', background: '#475569', borderRadius: '2px' }} />
                            </div>

                            <div style={{ width: `${aiSidebarWidth}px`, height: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0f172a', borderLeft: '1px solid #334155' }}>
                                {/* Right Tabs */}
                                <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                                    <div onClick={() => setActiveRightTab('chat')} style={rightTabStyle('chat')}>
                                        <MessageSquare size={14} /> AI Chat
                                    </div>
                                    <div onClick={() => setActiveRightTab('details')} style={rightTabStyle('details')}>
                                        <Info size={14} /> Details
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    {activeRightTab === 'chat' && (
                                        <AIChatSidebar
                                            messages={chatHistory}
                                            onSend={onAIStream}
                                            loading={aiLoading}
                                            aiState={aiStatus}
                                            title={showPlan ? "Plan Assistant" : "Query Assistant"}
                                            onRunSql={(sql) => { setSqlQuery(sql); }}
                                            onSimulateIndex={handleSimulateIndex}
                                            onApplyIndex={handleApplyIndex}
                                            onClose={() => { }}
                                            selectedModel={activeProvider}
                                            onModelChange={setActiveProvider}
                                            googleApiKey={googleApiKey}
                                            onSetGoogleApiKey={setGoogleApiKey}
                                            onOpenSettings={onOpenSettings}
                                            onClearHistory={onClearHistory}
                                            onIndexDatabase={onIndexDatabase}
                                            connectionInfo={connectionInfo}
                                        />
                                    )}
                                    {activeRightTab === 'details' && (
                                        <NodeDetailsPanel
                                            selectedNode={selectedNode}
                                            onClose={() => setSelectedNode(null)}
                                            fullPlan={explainResult}
                                            onAnalyzeNode={(node) => {
                                                setActiveRightTab('chat');
                                                onAnalyzeNode(node);
                                            }}
                                            onRunMaintenance={handleRunMaintenance}
                                        />
                                    )}
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === 'design' && (
                        <DesignTab
                            schema={schema}
                            loadingSchema={loadingSchema}
                            connectionInfo={connectionInfo}
                        />
                    )}

                    {activeTab === 'admin' && (
                        <AdminTab
                            connectionInfo={connectionInfo}
                            onOpenInWorkbench={(sql, autoTune) => {
                                setSqlQuery(sql);
                                setActiveTab('query');
                                if (autoTune) {
                                    setShowPlan(true);
                                    setTuneTabMode('visual');
                                    onTune(null, sql);
                                } else {
                                    handleExecuteWrapper(sql);
                                }
                            }}
                        />
                    )}

                </div>
            </div>
        </div>
    );
};

export default QueryWorkspace;
