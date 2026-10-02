import React from 'react';
import { Play, Square, Eraser, AlignLeft, Save, FileText, BarChart2, Sparkles, Settings } from 'lucide-react';

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
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
    sessionTitle,
    onExecute, isExecuting, onStop,
    onClear, onFormat, onSave,
    onExplain,
    onAskAI, onOpenSettings,
    showPlan, onTogglePlan
}) => {
    const ICON_SIZE = 15;
    const BUTTON_CLASS = "px-2 py-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-1.5 text-xs font-medium whitespace-nowrap flex-shrink-0";
    const DIVIDER_CLASS = "w-px h-4 bg-slate-800 mx-1.5 flex-shrink-0";

    return (
        <div className="h-10 bg-slate-950/90 border-b border-slate-800 flex items-center px-3 select-none overflow-x-auto no-scrollbar">
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
                    title="Execute Query (Cmd+Enter)"
                >
                    <Play size={13} fill="currentColor" />
                    <span>Run</span>
                    <span className="text-[10px] opacity-75 font-mono ml-0.5">⌘↵</span>
                </button>
                {isExecuting && (
                    <button
                        onClick={onStop}
                        className={BUTTON_CLASS}
                        title="Stop Execution"
                    >
                        <Square size={13} fill="currentColor" className="text-red-400" />
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
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        showPlan
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                            : 'hover:bg-slate-800 text-slate-300 border border-transparent'
                    }`}
                    title="Toggle EXPLAIN ANALYZE Visual Plan"
                >
                    <BarChart2 size={ICON_SIZE} />
                    <span>Explain Plan</span>
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
            <div className="flex-1 min-w-[12px] flex justify-end items-center px-2 overflow-hidden">
                {sessionTitle && sessionTitle !== 'Untitled Session' && (
                    <span className="text-xs text-slate-500 truncate max-w-[180px]" title={sessionTitle}>
                        {sessionTitle}
                    </span>
                )}
            </div>

            {/* Group 4: AI & Settings */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={onAskAI}
                    className="px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:text-purple-200 transition-colors flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
                    title="Explain or Optimize with AI"
                >
                    <Sparkles size={14} className="text-purple-400" />
                    <span>AI Explain</span>
                </button>

                {onOpenSettings && (
                    <button onClick={onOpenSettings} className={BUTTON_CLASS} title="Connection & AI Settings">
                        <Settings size={ICON_SIZE} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default EditorToolbar;

