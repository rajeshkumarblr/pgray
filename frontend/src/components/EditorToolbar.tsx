import React from 'react';
import { Play, Square, Eraser, AlignLeft, Save, FileText, BarChart2, Sparkles, PanelLeft, PanelRight } from 'lucide-react';

interface EditorToolbarProps {
    sessionTitle?: string;
    connectionInfo?: any;
    onExecute: () => void;
    isExecuting: boolean;
    onStop?: () => void;
    onClear: () => void;
    onFormat: () => void;
    onSave: () => void;
    onExplain: () => void;
    onVisualize?: () => void;
    onAskAI: () => void;
    onOpenSettings?: () => void;
    showPlan?: boolean;
    onTogglePlan?: () => void;
    showLeftSidebar?: boolean;
    onToggleLeftSidebar?: () => void;
    showRightSidebar?: boolean;
    onToggleRightSidebar?: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
    sessionTitle,
    onExecute, isExecuting, onStop,
    onClear, onFormat, onSave,
    onExplain,
    onAskAI,
    showPlan, onTogglePlan,
    showLeftSidebar = true, onToggleLeftSidebar,
    showRightSidebar = true, onToggleRightSidebar
}) => {
    const ICON_SIZE = 14;
    const BUTTON_CLASS = "px-2 py-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-1 text-xs font-medium whitespace-nowrap flex-shrink-0";
    const DIVIDER_CLASS = "w-px h-4 bg-slate-800 mx-1 flex-shrink-0";

    return (
        <div className="h-10 bg-slate-950/90 border-b border-slate-800 flex items-center px-2 select-none overflow-x-auto no-scrollbar">
            {/* Left Sidebar Toggle */}
            {onToggleLeftSidebar && (
                <>
                    <button
                        onClick={onToggleLeftSidebar}
                        className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
                            showLeftSidebar
                                ? 'text-slate-300 bg-slate-800/70 hover:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                        title={showLeftSidebar ? "Hide Schema Sidebar" : "Show Schema Sidebar"}
                    >
                        <PanelLeft size={14} />
                    </button>
                    <div className={DIVIDER_CLASS} />
                </>
            )}

            {/* Group 1: Execution */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={onExecute}
                    disabled={isExecuting}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all flex-shrink-0 ${
                        isExecuting
                            ? 'bg-emerald-800/70 cursor-wait opacity-60 text-emerald-200'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                    }`}
                    title="Execute Query or Selection (Cmd+Enter)"
                >
                    <Play size={12} fill="currentColor" />
                    <span>Run</span>
                    <span className="text-[10px] opacity-75 font-mono">⌘↵</span>
                </button>
                {isExecuting && (
                    <button
                        onClick={onStop}
                        className={BUTTON_CLASS}
                        title="Stop Execution"
                    >
                        <Square size={12} fill="currentColor" className="text-red-400" />
                    </button>
                )}
            </div>

            <div className={DIVIDER_CLASS} />

            {/* Group 2: Editor Tools */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={onFormat} className={BUTTON_CLASS} title="Format SQL (PostgreSQL)">
                    <AlignLeft size={ICON_SIZE} />
                    <span>Format</span>
                </button>
                <button onClick={onSave} className={BUTTON_CLASS} title="Save Parameterized Query">
                    <Save size={ICON_SIZE} />
                    <span>Save</span>
                </button>
                <button onClick={onClear} className={BUTTON_CLASS} title="Clear Editor">
                    <Eraser size={ICON_SIZE} />
                </button>
            </div>

            <div className={DIVIDER_CLASS} />

            {/* Group 3: Execution Plan & Tuning */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={onTogglePlan}
                    className={`px-2 py-1 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        showPlan
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                            : 'hover:bg-slate-800 text-slate-300 border border-transparent'
                    }`}
                    title="Toggle EXPLAIN ANALYZE Visual Plan"
                >
                    <BarChart2 size={ICON_SIZE} />
                    <span>Plan</span>
                </button>
                <button
                    onClick={onExplain}
                    className={BUTTON_CLASS}
                    title="View Raw Text EXPLAIN Output"
                >
                    <FileText size={ICON_SIZE} />
                </button>
            </div>

            {/* Spacer & Active Query Title */}
            <div className="flex-1 min-w-[8px] flex justify-end items-center px-1.5 overflow-hidden">
                {sessionTitle && sessionTitle !== 'Untitled Session' && (
                    <span className="text-[11px] text-slate-500 truncate max-w-[140px]" title={sessionTitle}>
                        {sessionTitle}
                    </span>
                )}
            </div>

            {/* Group 4: AI & Right Sidebar Toggle */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={onAskAI}
                    className="px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:text-purple-200 transition-colors flex items-center gap-1 text-xs font-medium whitespace-nowrap"
                    title="Explain or Optimize with AI"
                >
                    <Sparkles size={13} className="text-purple-400" />
                    <span>AI Tune</span>
                </button>

                {onToggleRightSidebar && (
                    <button
                        onClick={onToggleRightSidebar}
                        className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
                            showRightSidebar
                                ? 'text-slate-300 bg-slate-800/70 hover:bg-slate-800'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                        title={showRightSidebar ? "Hide AI / Details Sidebar" : "Show AI / Details Sidebar"}
                    >
                        <PanelRight size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default EditorToolbar;


