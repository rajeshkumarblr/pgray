import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Node } from 'reactflow';
import SchemaBrowser from './workspace/SchemaBrowser';
import SavedQueriesSidebar from './workspace/SavedQueriesSidebar';
import WorkspaceToolbar from './workspace/WorkspaceToolbar';
import BottomPane from './workspace/BottomPane';
import SimpleEditor from './SimpleEditor';
import DiffView from './DiffView';
import QueryTuneTab from './tabs/QueryTuneTab';
import ServerTuneTab from './tabs/ServerTuneTab';
import QueryParametersPanel from './workspace/QueryParametersPanel';
import PlanNode from './PlanNode';
import { getSavedQueries, ParameterizedQuery, ParamDef } from '../api';
import ERDiagram from './ERDiagram';

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
    onExecute: (sql?: string) => void;
    isExecuting: boolean;
    executionResult: any;
    execError?: string | null;
    onTune: () => void;
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
    activeTab: 'editor' | 'tune' | 'server' | 'schema' | 'er';
    setActiveTab: (tab: 'editor' | 'tune' | 'server' | 'schema' | 'er') => void;
    onAnalyzeParamQuery: (sql: string) => void;
    onEdit: (sql: string, name: string) => void;
    onOpenSettings?: () => void;
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
    onOpenSettings
}) => {

    // --- Local State ---
    const [savedQueries, setSavedQueries] = useState<ParameterizedQuery[]>([]);
    const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'details' | 'insights'>('results');
    const [bottomExpanded, setBottomExpanded] = useState(true);
    const [bottomHeight, setBottomHeight] = useState(300);
    const [tuneTabMode, setTuneTabMode] = useState<'visual' | 'text' | 'compare'>('visual');
    const [paramValues, setParamValues] = useState<Record<string, string>>({});

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

    // --- Handlers ---

    const handleSelectSavedQuery = (query: ParameterizedQuery) => {
        setSqlQuery(query.sql);
        setSessionTitle(query.name);
        setActiveTab('editor'); // Switch to editor when selecting a query
    };

    const handleExecuteWrapper = () => {
        // Support parameters if needed, or just regular execute
        // For now, simple execute
        onExecute(sqlQuery);
        // Ensure bottom pane is open to show results
        setActiveBottomTab('results');
        setBottomExpanded(true);
    };

    const handleTuneWrapper = () => {
        setActiveTab('tune');
        onTune();
    };

    const handleEditorWrapper = () => {
        setActiveTab('editor');
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
            {/* ... Sidebar ... */}
            <SavedQueriesSidebar
                connectionInfo={connectionInfo}
                onSelectQuery={handleSelectSavedQuery}
                queries={savedQueries}
                loading={loadingSavedQueries}
                onReload={loadSavedQueries}
            />

            {/* Main Center Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0f172a' }}>

                {/* 1. Toolbar */}
                <WorkspaceToolbar
                    onExecute={handleExecuteWrapper}
                    isExecuting={isExecuting}
                    onTune={handleTuneWrapper}
                    showDiff={showDiff}
                    setShowDiff={setShowDiff}
                    onCopy={onCopy}
                    onReset={onReset}
                    onOpenSettings={onOpenSettings}
                    onLoadSession={onLoadSession}
                    onNewSession={onNewSession}
                    onSaveSession={onSaveSession}
                    sessionTitle={sessionTitle}
                    setSessionTitle={setSessionTitle}
                />

                {/* 2. Tabs Row */}
                <div style={{ display: 'flex', background: '#334155', borderBottom: '1px solid #475569', paddingLeft: '10px' }}>
                    <div onClick={handleEditorWrapper} style={tabStyle('editor')}>Editor</div>
                    <div onClick={handleTuneWrapper} style={tabStyle('tune')}>Analyze</div>
                    <div onClick={() => setActiveTab('schema')} style={tabStyle('schema')}>Schema</div>
                    <div onClick={() => setActiveTab('er')} style={tabStyle('er')}>ER Diagram</div>
                    <div onClick={() => setActiveTab('server')} style={tabStyle('server')}>Server</div>
                </div>

                {/* 3. Center Content */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column' }}>

                    {/* Editor Tab */}
                    <div style={{
                        display: activeTab === 'editor' ? 'flex' : 'none',
                        height: '100%', flexDirection: 'column'
                    }}>
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
                                    language="sql"
                                    placeholder="SELECT * FROM ..."
                                    style={{ flex: 1 }}
                                />
                            )}
                        </div>

                        <div style={{ flexShrink: 0 }}>
                            <QueryParametersPanel
                                sql={sqlQuery}
                                paramValues={paramValues}
                                onChange={setParamValues}
                                connectionInfo={connectionInfo}
                                metaParams={activeQueryMetadata?.params as any}
                            />
                        </div>
                    </div>

                    {/* Tune Tab */}
                    <div style={{
                        display: activeTab === 'tune' ? 'block' : 'none',
                        height: '100%'
                    }}>
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

                {/* 4. Resizable Bottom Pane */}
                {bottomExpanded && (
                    <div
                        onMouseDown={startBottomResize}
                        style={{
                            height: '5px',
                            background: '#1e293b',
                            cursor: 'row-resize',
                            borderTop: '1px solid #334155',
                            display: 'flex', justifyContent: 'center', alignItems: 'center'
                        }}
                    >
                        <div style={{ width: '40px', height: '2px', background: '#475569', borderRadius: '2px' }} />
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
                    insights={insights}
                    onRunInsight={onRunInsight}
                    insightResults={insightResults}
                />
            </div>
        </div>
    );
};

export default QueryWorkspace;
