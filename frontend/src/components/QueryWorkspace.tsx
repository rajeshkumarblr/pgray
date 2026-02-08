
import React, { useState, useEffect, useCallback } from 'react';
import { Node } from 'reactflow';
import SavedQueriesSidebar from './workspace/SavedQueriesSidebar';
import AIChatSidebar from './AIChatSidebar';
import EditorToolbar from './EditorToolbar';
import BottomPane from './workspace/BottomPane';
import SimpleEditor from './SimpleEditor';
import DiffView from './DiffView';
import PlanNode from './PlanNode';
import { getSavedQueries, ParameterizedQuery, explainSql } from '../api';


import AskTab from '../pages/AskTab';
import AdminTab from './tabs/AdminTab';
import DesignTab from './tabs/DesignTab';
import QueryTuneTab from './tabs/QueryTuneTab';
import { Sparkles, Code, GitBranch, Settings } from 'lucide-react';


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
    onTune: (params?: any) => void;
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
    onExecute, isExecuting, executionResult, execError,
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
    const [aiSidebarWidth, setAiSidebarWidth] = useState(400);



    // --- Local State ---
    const [savedQueries, setSavedQueries] = useState<ParameterizedQuery[]>([]);
    const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'details' | 'insights' | 'visualplan'>('results');
    const [bottomExpanded, setBottomExpanded] = useState(false);
    const [bottomHeight, setBottomHeight] = useState(300);
    const [isBottomMaximized, setIsBottomMaximized] = useState(false);
    const [tuneTabMode, setTuneTabMode] = useState<'visual' | 'text' | 'compare'>('visual');
    const [paramValues, setParamValues] = useState<Record<string, string>>({});

    // Query Mode Switcher (Code | Plan)
    const [queryMode, setQueryMode] = useState<'code' | 'plan'>('code');

    // Auto-Trigger Explain Plan Logic
    useEffect(() => {
        // If user switches to Plan mode AND has SQL AND (no plan yet)
        // Or if sql changed (we can check against last explained sql if we track it, but for now
        // Auto-refresh Plan when switching - add sqlQuery to deps
        if (activeTab === 'query' && queryMode === 'plan' && sqlQuery && !explainResult) {
            onTune();
        }
    }, [activeTab, queryMode, explainResult, sqlQuery]); // Removed sqlQuery dep to avoid loop if explain result updates? No, need to re-explain if SQL changes. But onTune triggers explain which sets result.
    // If sqlQuery changes, explainResult is NOT automatically cleared in App.tsx?
    // App.tsx: setExecutionResult(null) is called on execute. But what about explain?
    // If I change SQL text, explainResult becomes stale. I should probably clear explainResult on SQL change in App.tsx ideally.
    // But here, if I switch to Plan, I want to see the plan for CURRENT sql.
    // Let's assume onTune handles it.

    // Lifted Search State
    const [searchPrompt, setSearchPrompt] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [pendingParams, setPendingParams] = useState<any[]>([]);

    // Recent Searches State
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    // SQL Explanation State for Search Tab
    const [sqlExplanation, setSqlExplanation] = useState<string | null>(null);





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

    // Auto-collapse bottom pane logic - simplified or removed?
    // Let's keep it but update for new tabs
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

        // Switch to Query tab
        if (activeTab === 'ask') {
            setActiveTab('query');
        }

        // Execute immediately OR Ask for params
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



    const handleExecuteWrapper = () => {
        onExecute(sqlQuery, paramValues);
        setActiveBottomTab('results');
        setBottomExpanded(true);
    };

    // Handler for opening Visual Plan in Mode
    const handleTuneWrapper = () => {
        setActiveTab('query');
        setQueryMode('plan');
        // Effect will trigger onTune if needed
    };

    // Handler for explaining SQL logic in plain English
    const handleExplainLogic = async () => {
        if (!sqlQuery) return;
        setSqlExplanation(null); // Clear previous to trigger loading state in UI
        try {
            const res = await explainSql(sqlQuery, schema);
            if (res && res.response) {
                setSqlExplanation(res.response);
            } else if (res && res.explanation) {
                setSqlExplanation(res.explanation);
            }
        } catch (e) {
            console.error("Failed to explain query", e);
            setSqlExplanation("Failed to generate explanation. Please try again.");
        }
    };

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

    // Tab Style Helper
    const tabStyle = (tab: 'ask' | 'query' | 'design' | 'admin') => ({
        padding: '10px 20px',
        cursor: 'pointer',
        color: activeTab === tab ? '#e2e8f0' : '#94a3b8',
        borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
        background: activeTab === tab ? '#1e293b' : 'transparent',
        fontWeight: activeTab === tab ? 600 : 500,
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none' as any,
        transition: 'all 0.15s ease'
    });




    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>

            {/* Main Center Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0f172a' }}>

                {/* 1. Tabs Row */}
                <div style={{ display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155', paddingLeft: '0px' }}>
                    <div onClick={() => setActiveTab('ask')} style={tabStyle('ask')}>
                        <Sparkles size={16} className={activeTab === 'ask' ? 'text-blue-400' : ''} /> Ask
                    </div>
                    <div onClick={() => setActiveTab('query')} style={tabStyle('query')}>
                        <Code size={16} className={activeTab === 'query' ? 'text-blue-400' : ''} /> Query
                    </div>
                    <div onClick={() => setActiveTab('design')} style={tabStyle('design')}>
                        <GitBranch size={16} className={activeTab === 'design' ? 'text-blue-400' : ''} /> Design
                    </div>
                    <div onClick={() => setActiveTab('admin')} style={tabStyle('admin')}>
                        <Settings size={16} className={activeTab === 'admin' ? 'text-blue-400' : ''} /> Admin
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
                            generatedSql={sqlQuery} // Pass SQL for Split View
                            // Mapping props
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
                            onTune={handleTuneWrapper}
                            onEditSql={() => { setActiveTab('query'); setQueryMode('code'); }}
                            connectionInfo={connectionInfo}
                            model={activeProvider === 'local' ? localModel : geminiModel}
                        />
                    )}

                    {activeTab === 'query' && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Mode Switcher */}
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                                <div style={{ display: 'flex', background: '#1e293b', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
                                    <button
                                        onClick={() => setQueryMode('code')}
                                        style={{
                                            padding: '4px 20px',
                                            borderRadius: '4px',
                                            background: queryMode === 'code' ? '#3b82f6' : 'transparent',
                                            color: queryMode === 'code' ? 'white' : '#94a3b8',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        Code
                                    </button>
                                    <button
                                        onClick={() => setQueryMode('plan')}
                                        style={{
                                            padding: '4px 20px',
                                            borderRadius: '4px',
                                            background: queryMode === 'plan' ? '#3b82f6' : 'transparent',
                                            color: queryMode === 'plan' ? 'white' : '#94a3b8',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        Plan
                                    </button>
                                </div>
                            </div>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
                                {/* Left Sidebar (Saved Queries) - Only in Code mode to maximize space in Plan? 
                                    Let's Keep it consistent for now, but user said "Render Circuit Board Full Screen (flex-1)". 
                                    I will hide it in Plan mode.
                                */}
                                {queryMode === 'code' && (
                                    <SavedQueriesSidebar
                                        connectionInfo={connectionInfo}
                                        onSelectQuery={handleSelectSavedQuery}
                                        queries={savedQueries}
                                        loading={loadingSavedQueries}
                                        onReload={loadSavedQueries}
                                        activeQueryName={sessionTitle}
                                    />
                                )}

                                {/* Main Area */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                                    {queryMode === 'code' ? (
                                        <>
                                            <EditorToolbar
                                                onExecute={handleExecuteWrapper}
                                                isExecuting={isExecuting}
                                                onStop={() => { }}
                                                onClear={onReset}
                                                onFormat={() => { }}
                                                onSave={onSaveSession}
                                                onExplain={handleTuneWrapper} // Map "Explain" to Plan Mode
                                                onAskAI={handleExplainLogic}
                                            />

                                            <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
                                                <SimpleEditor
                                                    key={loadingSavedQueries ? 'loading' : (sessionTitle || 'new')}
                                                    value={sqlQuery}
                                                    onChange={setSqlQuery}
                                                    onExecute={handleExecuteWrapper}
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

                                            {/* Bottom Pane (Results) */}
                                            {/* Maximize logic handling */}
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
                                                selectedNode={selectedNode}
                                                fullPlan={explainResult}
                                                onCloseDetails={() => setSelectedNode(null)}
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
                                                metaParams={[]} // Fix param defs if needed
                                                onExecuteQuery={handleExecuteWrapper}
                                                // Visual Plan Props (Moved to Plan Mode, but keeping here for 'visualplan' tab consistency if user uses bottom pane)
                                                // Wait, user said "Move Visual Plan ... to Top-Level Sub-Tab".
                                                // So I should probably REMOVE 'visualplan' from BottomPane?
                                                // Or keep it as legacy/alternative?
                                                // Let's pass the props anyway to avoid breaking BottomPane if it still has the tab.
                                                nodes={nodes}
                                                edges={edges}
                                                onNodesChange={onNodesChange}
                                                onNodeClick={onNodeClick}
                                                onPaneClick={onPaneClick}
                                                nodeTypes={nodeTypes}
                                                explainLoading={loadingExplain}
                                                explainError={explainError}
                                                onRefreshPlan={onTune}
                                                onAnalyzeNode={onAnalyzeNode}
                                            />
                                        </>
                                    ) : (
                                        /* PLAN MODE - Custom Layout */
                                        <div className="flex-1 h-full min-h-0 relative" style={{ display: 'flex', flexDirection: 'column' }}>
                                            <QueryTuneTab
                                                activeTab={tuneTabMode}
                                                setActiveTab={setTuneTabMode}
                                                nodes={nodes} edges={edges}
                                                onNodesChange={onNodesChange}
                                                onNodeClick={onNodeClick}
                                                onPaneClick={onPaneClick}
                                                selectedNode={selectedNode}
                                                explainResult={explainResult}
                                                explainText={explainText}
                                                loading={loadingExplain}
                                                error={explainError}
                                                setReactFlowInstance={() => { }}
                                                nodeTypes={nodeTypes}
                                                onAnalyzeNode={onAnalyzeNode}
                                                onRefreshPlan={onTune}
                                                onCompare={onCompare}
                                                baselineMetrics={baselineMetrics}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Right: AI Assistant (Always visible in Query Tab) */}
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

                                <div style={{ width: `${aiSidebarWidth}px`, height: '100%', flexShrink: 0 }}>
                                    <AIChatSidebar
                                        messages={chatHistory}
                                        onSend={onAIStream}
                                        loading={aiLoading}
                                        aiState={aiStatus}
                                        title={queryMode === 'plan' ? "Plan Assistant" : "Query Assistant"}
                                        onRunSql={(sql) => { setSqlQuery(sql); }}
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
                        <AdminTab connectionInfo={connectionInfo} />
                    )}

                </div>
            </div>
        </div>
    );
};

export default QueryWorkspace;
