
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Node } from 'reactflow';
import SchemaBrowser from './workspace/SchemaBrowser';
import SavedQueriesSidebar from './workspace/SavedQueriesSidebar';
import AIChatSidebar from './AIChatSidebar';
import EditorToolbar from './EditorToolbar';
import BottomPane from './workspace/BottomPane';
import SimpleEditor from './SimpleEditor';
import DiffView from './DiffView';
import QueryTuneTab from './tabs/QueryTuneTab';
import ServerTuneTab from './tabs/ServerTuneTab';
import PlanNode from './PlanNode';
import { getSavedQueries, ParameterizedQuery, ParamDef } from '../api';
import ERDiagram from './ERDiagram';
import SearchTab from '../pages/SearchTab';


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
    activeTab: 'search' | 'queries' | 'tune' | 'server' | 'schema' | 'er';
    setActiveTab: (tab: 'search' | 'queries' | 'tune' | 'server' | 'schema' | 'er') => void;
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
    onClearHistory, onIndexDatabase
}) => {

    // --- AI Sidebar State ---
    const [aiSidebarWidth, setAiSidebarWidth] = useState(400);
    const isResizingAISidebar = useRef(false);

    const startAISidebarResize = (e: React.MouseEvent) => {
        isResizingAISidebar.current = true;
        e.preventDefault();
        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizingAISidebar.current) return;
            const containerRect = (e.target as HTMLElement).parentElement?.getBoundingClientRect();
            if (containerRect) {
                const newWidth = containerRect.right - moveEvent.clientX;
                if (newWidth > 280 && newWidth < 600) {
                    setAiSidebarWidth(newWidth);
                }
            }
        };
        const onMouseUp = () => {
            isResizingAISidebar.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // --- Local State ---
    const [savedQueries, setSavedQueries] = useState<ParameterizedQuery[]>([]);
    const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'details' | 'insights'>('results');
    const [bottomExpanded, setBottomExpanded] = useState(false);
    const [bottomHeight, setBottomHeight] = useState(300);
    const [tuneTabMode, setTuneTabMode] = useState<'visual' | 'text' | 'compare'>('visual');
    const [paramValues, setParamValues] = useState<Record<string, string>>({});

    // Lifted Search State
    const [searchPrompt, setSearchPrompt] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [pendingParams, setPendingParams] = useState<any[]>([]);

    // Recent Searches State
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const addToRecents = (query: string) => {
        if (!query.trim()) return;
        setRecentSearches(prev => {
            // Remove duplicates and keep top 5
            const newRecents = [query, ...prev.filter(q => q !== query)].slice(0, 5);
            return newRecents;
        });
    };

    // --- Lifted Selection State for Schema/ER ---
    const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());

    // Auto-select all when schema loads
    useEffect(() => {
        if (schema && selectedTables.size === 0) {
            setSelectedTables(new Set(Object.keys(schema)));
        }
    }, [schema]);

    // Derived filtered schema for ER
    const filteredSchema = React.useMemo(() => {
        if (!schema) return null;
        const filtered: any = {};
        selectedTables.forEach(t => {
            if (schema[t]) filtered[t] = schema[t];
        });
        return filtered;
    }, [schema, selectedTables]);

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

    // Auto-collapse bottom pane for non-query tabs
    useEffect(() => {
        if (!['queries', 'tune', 'search'].includes(activeTab)) {
            setBottomExpanded(false);
        }
    }, [activeTab]);

    // --- Handlers ---

    const handleSelectSavedQuery = (query: ParameterizedQuery) => {
        setSqlQuery(query.sql);
        setSessionTitle(query.name);
        setSearchPrompt(query.name);
        setShowSearchResults(false);

        // Switch to Queries tab if in Search, otherwise stay in current tab
        if (activeTab === 'search') {
            setActiveTab('queries');
        }

        // Execute immediately OR Ask for params
        if (query.params && query.params.length > 0) {
            setPendingParams(query.params);
            // Do NOT execute yet. Show param form.
        } else {
            setPendingParams([]);
            onExecute(query.sql);
        }
    };

    const handleRunParameterizedSearch = (values: Record<string, string>) => {
        // Run with parameters
        onExecute(sqlQuery, values);
    };

    const handleExecuteWrapper = () => {
        // Support parameters if needed, or just regular execute
        // For now, simple execute
        onExecute(sqlQuery, paramValues);
        // Ensure bottom pane is open to show results
        setActiveBottomTab('results');
        setBottomExpanded(true);
    };

    const handleTuneWrapper = () => {
        setActiveTab('tune');
        onTune(paramValues);
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

    const tabStyle = (tabName: string) => ({
        padding: '8px 16px',
        cursor: 'pointer',
        color: activeTab === tabName ? '#60a5fa' : '#94a3b8',
        borderBottom: activeTab === tabName ? '2px solid #60a5fa' : '2px solid transparent',
        fontWeight: activeTab === tabName ? ('bold' as const) : ('normal' as const)
    });

    const activeQueryMetadata = React.useMemo(() => {
        return savedQueries.find(q => q.name === sessionTitle);
    }, [savedQueries, sessionTitle]);


    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>

            {/* Main Center Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0f172a' }}>

                {/* 1. Tabs Row */}
                <div style={{ display: 'flex', background: '#334155', borderBottom: '1px solid #475569', paddingLeft: '10px' }}>
                    <div onClick={() => setActiveTab('search')} style={tabStyle('search')}>Search</div>
                    <div onClick={() => setActiveTab('queries')} style={tabStyle('queries')}>Queries</div>
                    <div onClick={handleTuneWrapper} style={tabStyle('tune')}>Analyze</div>
                    <div onClick={() => setActiveTab('schema')} style={tabStyle('schema')}>Schema</div>
                    <div onClick={() => setActiveTab('er')} style={tabStyle('er')}>ER Diagram</div>
                    <div onClick={() => setActiveTab('server')} style={tabStyle('server')}>Server</div>
                </div>

                {/* 2. Toolbar */}
                <EditorToolbar
                    onExecute={handleExecuteWrapper}
                    isExecuting={isExecuting}
                    onStop={() => { }}
                    onClear={onReset}
                    onFormat={() => { }}
                    onSave={onSaveSession}
                    onExplain={handleTuneWrapper}
                    onVisualize={() => { setActiveBottomTab('results'); setBottomExpanded(true); }}
                    onAskAI={() => { }}
                    onOpenSettings={onOpenSettings}
                    sessionTitle={sessionTitle}
                    connectionInfo={connectionInfo}
                />

                {/* 3. Center Content */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column' }}>

                    {/* Search Tab */}
                    <div style={{
                        display: activeTab === 'search' ? 'block' : 'none',
                        height: '100%'
                    }}>
                        <SearchTab
                            onSearch={(p) => {
                                // Default search handler from tab input
                                onAppSearch(p);
                                setShowSearchResults(true);
                                setPendingParams([]);
                                addToRecents(p);
                            }}
                            isExecuting={isExecuting}
                            result={executionResult}
                            error={execError || null}
                            generatedSql={sqlQuery}
                            onExplain={handleTuneWrapper}
                            explainResult={explainResult}
                            onReset={() => {
                                setShowSearchResults(false);
                                setSearchPrompt('');
                                setPendingParams([]);
                                onReset(); // Parent reset
                            }}
                            promptValue={searchPrompt}
                            onPromptChange={setSearchPrompt}
                            showResults={showSearchResults}
                            onShowResults={setShowSearchResults}
                            requiredParams={pendingParams}
                            onRunParameterized={handleRunParameterizedSearch}

                            // Smart Dropdown Props
                            savedQueries={savedQueries}
                            recentSearches={recentSearches}
                            onSelectQuery={(q) => {
                                // Handle selection from dropdown
                                if (!q) return;
                                // Check if it's a saved query object or a raw string
                                if (typeof q === 'string') {
                                    // Treat as raw search prompt
                                    setSearchPrompt(q);
                                    // Maybe auto-submit?
                                    onAppSearch(q);
                                    setShowSearchResults(true);
                                    addToRecents(q);
                                } else {
                                    // It's a Saved Query object
                                    handleSelectSavedQuery(q);
                                }
                            }}
                        />
                    </div>

                    {/* Queries Tab - 3 Column Layout */}
                    {activeTab === 'queries' && (
                        <div style={{ display: 'flex', height: '100%', flex: 1, overflow: 'hidden' }}>
                            {/* Left: Saved Queries */}
                            <SavedQueriesSidebar
                                connectionInfo={connectionInfo}
                                onSelectQuery={handleSelectSavedQuery}
                                queries={savedQueries}
                                loading={loadingSavedQueries}
                                onReload={loadSavedQueries}
                                activeQueryName={sessionTitle}
                            />

                            {/* Center: Editor + Bottom Pane */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    {showDiff ? (
                                        <DiffView
                                            oldCode={diffBaseQuery}
                                            newCode={sqlQuery}
                                            onClose={() => setShowDiff(false)}
                                        />
                                    ) : (
                                        <SimpleEditor
                                            value={sqlQuery}
                                            onChange={setSqlQuery}
                                            schema={schema}
                                            highlightLines={highlightedLines}
                                        />
                                    )}
                                </div>

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
                                    insights={insights}
                                    onRunInsight={onRunInsight}
                                    insightResults={insightResults}
                                    sqlQuery={sqlQuery}
                                    paramValues={paramValues}
                                    onParamChange={setParamValues}
                                    connectionInfo={connectionInfo}
                                    metaParams={activeQueryMetadata?.params as any}
                                    onExecuteQuery={handleExecuteWrapper}
                                />
                            </div>

                            {/* Resize Handle */}
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

                            {/* Right: AI Assistant */}
                            <div style={{ width: `${aiSidebarWidth}px`, height: '100%', flexShrink: 0 }}>
                                <AIChatSidebar
                                    messages={chatHistory}
                                    onSend={onAIStream}
                                    loading={aiLoading}
                                    aiState={aiStatus}
                                    title="Query Assistant"
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
                    )}

                    {/* Analyze Tab - 3 Column Layout */}
                    {activeTab === 'tune' && (
                        <div style={{ display: 'flex', height: '100%', flex: 1, overflow: 'hidden' }}>
                            {/* Left: Saved Queries */}
                            <SavedQueriesSidebar
                                connectionInfo={connectionInfo}
                                onSelectQuery={handleSelectSavedQuery}
                                queries={savedQueries}
                                loading={loadingSavedQueries}
                                onReload={loadSavedQueries}
                                activeQueryName={sessionTitle}
                            />

                            {/* Center: Query Tune Content */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
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

                            {/* Resize Handle */}
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

                            {/* Right: AI Assistant */}
                            <div style={{ width: `${aiSidebarWidth}px`, height: '100%', flexShrink: 0 }}>
                                <AIChatSidebar
                                    messages={chatHistory}
                                    onSend={onAIStream}
                                    loading={aiLoading}
                                    aiState={aiStatus}
                                    title="Query Assistant"
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
                    )}

                    {/* Server Tab */}
                    <div style={{
                        display: activeTab === 'server' ? 'block' : 'none',
                        height: '100%'
                    }}>
                        <ServerTuneTab connectionInfo={connectionInfo} />
                    </div>

                    {/* Schema Tab */}
                    <div style={{
                        display: activeTab === 'schema' ? 'block' : 'none',
                        height: '100%'
                    }}>
                        <SchemaBrowser
                            schema={schema}
                            loadingSchema={loadingSchema}
                            connectionInfo={connectionInfo}
                            selectedTables={selectedTables}
                            setSelectedTables={setSelectedTables}
                            onShowER={() => setActiveTab('er')}
                        />
                    </div>

                    {/* ER Diagram Tab */}
                    <div style={{
                        display: activeTab === 'er' ? 'block' : 'none',
                        height: '100%'
                    }}>
                        {filteredSchema && (
                            <ERDiagram
                                schema={filteredSchema}
                                connectionInfo={connectionInfo}
                            />
                        )}
                    </div>

                </div>
            </div >
        </div >
    );
};

export default QueryWorkspace;
