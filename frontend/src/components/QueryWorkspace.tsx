import React, { useState, useEffect, useRef } from 'react';
import SchemaBrowser from './workspace/SchemaBrowser';
import WorkspaceToolbar from './workspace/WorkspaceToolbar';
import BottomPane from './workspace/BottomPane';
import SimpleEditor from './SimpleEditor';
import DiffView from './DiffView';
import QueryTuneTab from './tabs/QueryTuneTab';
import ServerTuneTab from './tabs/ServerTuneTab';
import PlanNode from './PlanNode'; // Import Custom Node
import { getSavedQueries } from '../api';

const nodeTypes = { planNode: PlanNode }; // Define Node Types

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
    onExecute: () => void;
    isExecuting: boolean;
    executionResult: any;
    execError?: string | null;
    onTune: () => void;
    explainResult: any;
    explainText: string;
    loadingExplain: boolean;
    explainError: string;
    // Tune Specific
    selectedNode: any;
    setSelectedNode: (node: any) => void;
    nodes: any[];
    edges: any[];
    onNodesChange: any;
    onNodeClick: any;
    onPaneClick: any;

    // Diff
    diffBaseQuery: string;
    showDiff: boolean;
    setShowDiff: (b: boolean) => void;

    // Misc
    onCopy: () => void;
    onReset: () => void;
    onAnalyzeNode: (node: Node) => void;

    // Insights
    insights: any[];
    onRunInsight: (id: string, sql: string) => void;
    insightResults: any;
    onCompare: () => void;
    baselineMetrics: { planning: number, execution: number } | null;
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
    onCompare, baselineMetrics
}) => {
    // Layout State
    const [activeCenterTab, setActiveCenterTab] = useState<'editor' | 'tune' | 'server'>('editor');
    const [tuneTabMode, setTuneTabMode] = useState<'plan' | 'text'>('plan'); // New State
    const [bottomExpanded, setBottomExpanded] = useState(true);
    const [bottomHeight, setBottomHeight] = useState(() => Math.max(150, window.innerHeight * 0.2)); // 20% default
    const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'details' | 'insights'>('results');

    // Resizing Bottom Pane
    const isResizingBottom = useRef(false);

    const startBottomResize = (e: React.MouseEvent) => {
        isResizingBottom.current = true;
        e.preventDefault();
        document.addEventListener('mousemove', handleBottomResize);
        document.addEventListener('mouseup', stopBottomResize);
    };

    const handleBottomResize = (e: MouseEvent) => {
        if (!isResizingBottom.current) return;
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 50 && newHeight < window.innerHeight - 200) {
            setBottomHeight(newHeight);
        }
    };

    const stopBottomResize = () => {
        isResizingBottom.current = false;
        document.removeEventListener('mousemove', handleBottomResize);
        document.removeEventListener('mouseup', stopBottomResize);
    };


    // Local Session State
    const [savedQueries, setSavedQueries] = useState<string[]>([]);

    useEffect(() => {
        getSavedQueries().then(data => {
            if (data && data.queries) setSavedQueries(data.queries);
        }).catch(err => console.error("Failed to fetch saved queries", err));
    }, []);

    // Automatically switch tabs based on actions
    useEffect(() => {
        if (executionResult) {
            setActiveBottomTab('results');
            if (!bottomExpanded) setBottomExpanded(true);
        }
    }, [executionResult]);

    useEffect(() => {
        if (selectedNode) {
            setActiveBottomTab('details');
            if (!bottomExpanded) setBottomExpanded(true);
        }
    }, [selectedNode]);

    // Auto-open Insights if we get new ones
    useEffect(() => {
        if (insights && insights.length > 0) {
            setActiveBottomTab('insights');
            if (!bottomExpanded) setBottomExpanded(true);
        }
    }, [insights]);

    // Handle Tab Switching
    const handleExecuteWrapper = () => {
        setActiveCenterTab('editor');
        onExecute();
    };

    const handleEditorWrapper = () => {
        setActiveCenterTab('editor');
        setActiveBottomTab('results');
    };

    const handleTuneWrapper = () => {
        setActiveCenterTab('tune');
        setActiveBottomTab('details');
        // Auto-trigger if missing
        if (!explainResult || (explainResult && Array.isArray(explainResult) && explainResult.length === 0)) {
            onTune();
        }
    };

    const tabStyle = (tab: string) => ({
        padding: '8px 20px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: activeCenterTab === tab ? 600 : 500,
        color: activeCenterTab === tab ? '#e2e8f0' : '#94a3b8',
        borderBottom: activeCenterTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
        background: activeCenterTab === tab ? '#1e293b' : 'transparent',
    });

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
            {/* Left: Schema Browser */}
            <SchemaBrowser
                schema={schema}
                loadingSchema={loadingSchema}
                connectionInfo={connectionInfo}
            />

            {/* Main Center Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0f172a' }}>

                {/* 1. Toolbar */}
                <WorkspaceToolbar
                    sessionTitle={sessionTitle}
                    setSessionTitle={setSessionTitle}
                    savedQueries={savedQueries}
                    onLoadSession={onLoadSession}
                    onNewSession={onNewSession}
                    onSaveSession={onSaveSession}
                    onExecute={handleExecuteWrapper}
                    isExecuting={isExecuting}
                    onTune={handleTuneWrapper}
                    showDiff={showDiff}
                    setShowDiff={setShowDiff}
                    onCopy={onCopy}
                    onReset={onReset}
                />

                {/* 2. Tabs Row (Below Toolbar) */}
                <div style={{ display: 'flex', background: '#334155', borderBottom: '1px solid #475569', paddingLeft: '10px' }}>
                    <div onClick={handleEditorWrapper} style={tabStyle('editor')}>Editor</div>
                    <div onClick={handleTuneWrapper} style={tabStyle('tune')}>Analyze</div>
                    <div onClick={() => setActiveCenterTab('server')} style={tabStyle('server')}>Server</div>
                </div>

                {/* 3. Center Content */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1e293b' }}>

                    {/* Editor Tab */}
                    <div style={{
                        display: activeCenterTab === 'editor' ? 'flex' : 'none',
                        height: '100%', flexDirection: 'column'
                    }}>
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

                    {/* Tune Tab */}
                    <div style={{
                        display: activeCenterTab === 'tune' ? 'block' : 'none',
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
                        display: activeCenterTab === 'server' ? 'block' : 'none',
                        height: '100%'
                    }}>
                        <ServerTuneTab connectionInfo={connectionInfo} />
                    </div>
                </div>

                {/* 4. Resizable Bottom Pane */}
                {/* Resizer Handle */}
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
