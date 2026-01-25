import React, { useState } from 'react';

interface WorkspaceToolbarProps {
    sessionTitle: string;
    setSessionTitle: (t: string) => void;
    // savedQueries managed internally by Workspace now? No, we moved it to Workspace but didn't update Toolbar to remove it?
    // Wait, QueryWorkspace passed savedQueries to Toolbar in Step 186/198.
    // So Toolbar DOES receive it.
    savedQueries: string[];
    onLoadSession: (name: string) => void;
    onNewSession: () => void;
    onSaveSession: () => Promise<void>;
    onExecute: () => void;
    isExecuting: boolean;
    onTune: () => void;
    showDiff: boolean;
    setShowDiff: (show: boolean) => void;
    onCopy: () => void;
    onReset: () => void;
}

const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
    sessionTitle, setSessionTitle,
    savedQueries, onLoadSession, onNewSession,
    onSaveSession,
    onExecute, isExecuting,
    onTune,
    showDiff, setShowDiff,
    onCopy, onReset,
    // activeTab, setActiveTab // Removed
}) => {
    const [showSessionList, setShowSessionList] = useState(false);

    // const tabStyle = (tab: string) => ({ // Removed
    //     padding: '4px 12px',
    //     cursor: 'pointer',
    //     fontWeight: 600,
    //     fontSize: '12px',
    //     color: activeTab === tab ? '#e2e8f0' : '#94a3b8',
    //     background: activeTab === tab ? '#1e293b' : 'transparent',
    //     borderRadius: '4px',
    //     border: activeTab === tab ? '1px solid #475569' : '1px solid transparent'
    // });

    return (
        <div style={{ padding: '8px 10px', background: '#334155', borderBottom: '1px solid #475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Tabs Group */}
                {/* <div style={{ display: 'flex', background: '#0f172a', padding: '2px', borderRadius: '6px', marginRight: '10px' }}> // Removed
                    <div onClick={() => setActiveTab('editor')} style={tabStyle('editor')}>Editor</div>
                    <div onClick={() => setActiveTab('tune')} style={tabStyle('tune')}>Tune</div>
                    <div onClick={() => setActiveTab('server')} style={tabStyle('server')}>Server</div>
                </div> */}

                {/* <div style={{ width: '1px', height: '20px', background: '#475569', margin: '0 5px' }} /> */}

                <button
                    onClick={onNewSession}
                    style={{
                        background: '#3b82f6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                        whiteSpace: 'nowrap'
                    }}
                    title="Start new session"
                >
                    ➕ New
                </button>

                <button
                    onClick={async () => {
                        const btn = document.getElementById('btn-workspace-save');
                        if (btn) btn.innerText = "Saving...";
                        await onSaveSession();
                        if (btn) btn.innerText = "💾 Save";
                    }}
                    id="btn-workspace-save"
                    style={{
                        background: '#f59e0b', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title="Save Session"
                >
                    💾 Save
                </button>

                <button
                    onClick={onExecute}
                    disabled={isExecuting}
                    style={{
                        background: '#22c55e', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                        cursor: isExecuting ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                >
                    {isExecuting ? 'Running...' : '▶ Execute'}
                </button>

                <button
                    onClick={onTune}
                    style={{
                        background: '#8b5cf6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title="Analyze Execution Plan"
                >
                    ⚡ Analyze
                </button>

                <button
                    onClick={() => setShowDiff(!showDiff)}
                    style={{
                        background: showDiff ? '#475569' : 'transparent',
                        border: '1px solid #475569',
                        color: showDiff ? 'white' : '#cbd5e1',
                        padding: '4px 12px', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title="Toggle Diff View"
                >
                    ⚖️ Diff
                </button>
                <button
                    onClick={onCopy}
                    style={{
                        background: 'transparent',
                        border: '1px solid #475569',
                        color: '#cbd5e1',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="Copy SQL"
                >
                    📋
                </button>
                <button
                    onClick={onReset}
                    style={{
                        background: 'transparent',
                        border: '1px solid #475569',
                        color: '#cbd5e1',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 600
                    }}
                    title="Clear Plan (Reset Editor & History)"
                >
                    🗑️
                </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, marginLeft: '10px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
                    <input
                        type="text"
                        value={sessionTitle}
                        onChange={(e) => setSessionTitle(e.target.value)}
                        placeholder="Untitled Session"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px dashed #475569',
                            color: '#facc15',
                            fontWeight: 600,
                            fontSize: '13px',
                            width: '100%',
                            outline: 'none',
                            paddingRight: '25px'
                        }}
                        title="Type to rename session"
                    />

                    {/* Dropdown Trigger */}
                    <div
                        onClick={() => setShowSessionList(!showSessionList)}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#94a3b8'
                        }}
                        title="Show All Sessions"
                    >
                        ▼
                    </div>

                    {/* Dropdown List */}
                    {showSessionList && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            background: '#1e293b',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            marginTop: '4px',
                            zIndex: 1000,
                            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                        }}>
                            {savedQueries.map(q => (
                                <div
                                    key={q}
                                    onClick={() => {
                                        onLoadSession(q);
                                        setShowSessionList(false);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '13px',
                                        color: '#e2e8f0',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #334155',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {q || "(Untitled)"}
                                </div>
                            ))}
                            {savedQueries.length === 0 && (
                                <div style={{ padding: '8px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                                    No saved sessions found.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkspaceToolbar;
