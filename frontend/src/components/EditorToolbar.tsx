import React from 'react';
import { Play, Square, Eraser, AlignLeft, Save, Search, BarChart, Sparkles, Settings, Database } from 'lucide-react';

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
    connectionInfo,
    onExecute, isExecuting, onStop,
    onClear, onFormat, onSave,
    onExplain, onVisualize,
    onAskAI, onOpenSettings,
    showPlan, onTogglePlan
}) => {

    // Configurable styles constants
    const ICON_SIZE = 16;
    const BUTTON_CLASS = "p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors flex items-center justify-center";
    const DIVIDER_CLASS = "w-px h-5 bg-gray-700 mx-2";

    return (
        <div className="h-12 bg-[#0D0D0D] border-b border-gray-800 flex items-center px-4 select-none">

            {/* Group 1: Execution */}
            <div className="flex items-center gap-1">
                <button
                    onClick={onExecute}
                    disabled={isExecuting}
                    className={`p-2 rounded flex items-center justify-center transition-colors ${isExecuting ? 'bg-green-800 cursor-wait opacity-50' : 'bg-green-600 hover:bg-green-500'
                        } text-white`}
                    title="Execute Query (Ctrl+Enter)"
                >
                    <Play size={ICON_SIZE} fill="currentColor" />
                </button>
                {/* Optional Stop Button - Placeholder action if not provided */}
                <button
                    onClick={onStop}
                    className={BUTTON_CLASS}
                    title="Stop Execution"
                    disabled={!isExecuting}
                >
                    <Square size={ICON_SIZE} fill="currentColor" />
                </button>
            </div>

            <div className={DIVIDER_CLASS} />

            {/* Group 2: Editor Tools */}
            <div className="flex items-center gap-1">
                <button onClick={onClear} className={BUTTON_CLASS} title="Clear Editor">
                    <Eraser size={ICON_SIZE} />
                </button>
                <button onClick={onFormat} className={BUTTON_CLASS} title="Format SQL">
                    <AlignLeft size={ICON_SIZE} />
                </button>
                <button onClick={onSave} className={BUTTON_CLASS} title="Save Query">
                    <Save size={ICON_SIZE} />
                </button>
            </div>

            <div className={DIVIDER_CLASS} />

            {/* Group 3: Analysis */}
            <div className="flex items-center gap-1">
                <button
                    onClick={onTogglePlan}
                    className={`${BUTTON_CLASS} ${showPlan ? 'text-blue-400 bg-slate-800' : ''}`}
                    title="Toggle Plan View"
                >
                    <BarChart size={ICON_SIZE} className={showPlan ? "fill-current" : ""} />
                </button>
                <button onClick={onExplain} className={BUTTON_CLASS} title="Explain Plan (Text)">
                    <Search size={ICON_SIZE} />
                </button>
            </div>

            {/* Spacer & Database Selector */}
            <div className="flex-1 flex justify-end items-center pr-4">
                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition-colors text-sm"
                    title="Switch Database"
                >
                    <Database size={14} />
                    <span>{connectionInfo?.database || 'Select DB'}</span>
                    <span className="text-xs text-gray-500">▼</span>
                </button>
            </div>

            {/* Group 4: AI & Settings */}
            <div className="flex items-center gap-1">
                <button
                    onClick={onAskAI}
                    className={`${BUTTON_CLASS} !text-purple-400 hover:!text-purple-200`}
                    title="Ask AI Assistant"
                >
                    <Sparkles size={ICON_SIZE} />
                </button>

                {onOpenSettings && (
                    <button onClick={onOpenSettings} className={BUTTON_CLASS} title="Settings">
                        <Settings size={ICON_SIZE} />
                    </button>
                )}
            </div>

        </div>
    );
};

export default EditorToolbar;
