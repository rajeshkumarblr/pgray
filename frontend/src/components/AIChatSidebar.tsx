import React, { useRef, useEffect, useState } from 'react';
import { warmupModel, autocomplete } from '../api';
import { Sparkles, Trash2, Database, Send, X, FlaskConical, Check, CornerDownLeft, Copy } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    status?: 'success' | 'error' | 'pending';
    hidden?: boolean;
    respTime?: string;
    ttft?: string;
    planTime?: string;
    execTime?: string;
}

interface AIChatSidebarProps {
    messages: Message[];
    onClose: () => void;
    onSend: (msg: string) => void;
    aiState?: 'idle' | 'thinking' | 'generating';
    loading?: boolean;
    title?: string;
    onRunSql?: (sql: string) => void;
    onDiff?: (sql: string) => void;
    selectedModel?: string;
    onModelChange?: (model: string) => void;
    googleApiKey?: string;
    onSetGoogleApiKey?: (key: string) => void;
    onOpenSettings?: () => void;
    onClearHistory?: () => void;
    onIndexDatabase?: () => void;
    connectionInfo: any;
    onSimulateIndex?: (indexSql: string) => void;
    onApplyIndex?: (indexSql: string) => void;
}

const STARTER_PROMPTS = [
    {
        label: 'Analyze query & suggest indexes',
        prompt: 'Analyze the current SQL query and its execution plan. Suggest any indexes or rewrites to improve performance.'
    },
    {
        label: 'Explain execution plan step-by-step',
        prompt: 'Walk me through the execution plan of this query step-by-step and explain what each node is doing.'
    },
    {
        label: 'Rewrite query for performance',
        prompt: 'Can this SQL query be rewritten (e.g. better join order, CTEs, or predicates) to execute faster in PostgreSQL?'
    },
    {
        label: 'Find complex analytical insights',
        prompt: 'Write an advanced analytical PostgreSQL query using CTEs and window functions for this schema.'
    }
];

const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
    messages, onClose, onSend, loading, aiState = 'idle', onRunSql,
    selectedModel = "local", onModelChange,
    onClearHistory, onIndexDatabase,
    connectionInfo, onSimulateIndex, onApplyIndex
}) => {
    const endRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState('');
    const [inputHistory, setInputHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [hasWarmedUp, setHasWarmedUp] = useState(false);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!input || !connectionInfo) {
            setShowSuggestions(false);
            return;
        }

        const cursor = inputRef.current?.selectionStart || 0;
        const textBeforeRequest = input.slice(0, cursor);
        const lastWord = textBeforeRequest.split(/\s/).pop() || '';

        if (lastWord.startsWith('@') && lastWord.length >= 3) {
            const term = lastWord.substring(1);
            const timer = setTimeout(() => {
                autocomplete(connectionInfo, term).then(res => {
                    if (res && res.length > 0) {
                        setSuggestions(res);
                        setShowSuggestions(true);
                        setSuggestionIndex(0);
                    } else {
                        setShowSuggestions(false);
                    }
                });
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setShowSuggestions(false);
        }
    }, [input, connectionInfo]);

    const insertSuggestion = (s: any) => {
        if (!inputRef.current) return;
        const cursor = inputRef.current.selectionStart;
        const textBefore = input.slice(0, cursor);
        const textAfter = input.slice(cursor);
        const lastWord = textBefore.split(/\s/).pop() || '';

        const newTextBefore = textBefore.slice(0, -lastWord.length);
        const insertion = s.type === 'table' ? s.value : `${s.value} (ID: ${s.meta.match(/ID: (.*?)\)/)?.[1] || '?'})`;

        setInput(newTextBefore + insertion + " " + textAfter);
        setShowSuggestions(false);
        inputRef.current.focus();
    };

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, aiState]);

    const handleSend = () => {
        if (input.trim() && !loading && aiState === 'idle') {
            onSend(input);
            setInputHistory(prev => [...prev, input]);
            setHistoryIndex(-1);
            setInput('');
            setHasWarmedUp(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestionIndex(prev => (prev + 1) % suggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertSuggestion(suggestions[suggestionIndex]);
                return;
            }
            if (e.key === 'Escape') {
                setShowSuggestions(false);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        } else if (e.key === 'ArrowUp' && e.ctrlKey) {
            e.preventDefault();
            if (inputHistory.length > 0) {
                const newIndex = historyIndex === -1 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(newIndex);
                setInput(inputHistory[newIndex]);
            }
        } else if (e.key === 'ArrowDown' && e.ctrlKey) {
            e.preventDefault();
            if (historyIndex !== -1) {
                const newIndex = historyIndex + 1;
                if (newIndex >= inputHistory.length) {
                    setHistoryIndex(-1);
                    setInput('');
                } else {
                    setHistoryIndex(newIndex);
                    setInput(inputHistory[newIndex]);
                }
            }
        }
    };

    const renderMessageContent = (msg: Message, index: number) => {
        const { content, role, respTime, planTime, execTime } = msg;

        if (role === 'user') {
            let associatedSql = null;
            if (index + 1 < messages.length && messages[index + 1].role === 'assistant') {
                const nextContent = messages[index + 1].content;
                const sqlMatch = nextContent.match(/```sql([\s\S]*?)```/);
                if (sqlMatch) {
                    associatedSql = sqlMatch[1].trim();
                }
            }

            return (
                <div
                    onClick={() => {
                        if (associatedSql && onRunSql) {
                            onRunSql(associatedSql);
                        }
                    }}
                    className={`whitespace-pre-wrap ${associatedSql ? 'cursor-pointer' : ''}`}
                    title={associatedSql ? "Click to load this query" : undefined}
                >
                    {content}
                </div>
            );
        }

        const parts = content.split(/(```[\w]*[\s\S]*?```)/g);

        return (
            <div className="whitespace-pre-wrap text-xs leading-relaxed">
                {parts.map((part, i) => {
                    const isCodeBlock = part.startsWith('```');

                    if (isCodeBlock) {
                        const sql = part.replace(/^```[\w]*\n?|```$/g, '').trim();
                        if (!sql) return null;

                        const isCreateIndex = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(sql);

                        return (
                            <div
                                key={i}
                                className="flex flex-col gap-1.5 my-2 bg-slate-950 border border-slate-800 rounded-lg p-2.5"
                            >
                                <pre className="m-0 text-[11px] leading-relaxed text-sky-300 font-mono overflow-x-auto max-h-[140px] whitespace-pre-wrap break-words">
                                    {sql}
                                </pre>

                                <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-slate-800/80">
                                    {isCreateIndex ? (
                                        <>
                                            {onSimulateIndex && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSimulateIndex(sql)}
                                                    className="flex items-center gap-1 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 text-[10px] font-semibold px-2 py-1 rounded transition-colors"
                                                    title="Test this index inside a rollback transaction and compare EXPLAIN ANALYZE before & after"
                                                >
                                                    <FlaskConical size={11} />
                                                    <span>Simulate Index</span>
                                                </button>
                                            )}
                                            {onApplyIndex && (
                                                <button
                                                    type="button"
                                                    onClick={() => onApplyIndex(sql)}
                                                    className="flex items-center gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold px-2 py-1 rounded transition-colors"
                                                    title="Create this index in the database and refresh the execution plan"
                                                >
                                                    <Check size={11} />
                                                    <span>Create Index</span>
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        onRunSql && (
                                            <button
                                                type="button"
                                                onClick={() => onRunSql(sql)}
                                                className="flex items-center gap-1 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 text-[10px] font-semibold px-2 py-1 rounded transition-colors"
                                                title="Load this SQL query into the workbench editor"
                                            >
                                                <CornerDownLeft size={11} />
                                                <span>Load in Editor</span>
                                            </button>
                                        )
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(sql)}
                                        className="ml-auto flex items-center gap-1 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] px-2 py-1 rounded transition-colors"
                                        title="Copy SQL to clipboard"
                                    >
                                        <Copy size={10} />
                                        <span>Copy</span>
                                    </button>
                                </div>

                                {(respTime || planTime || execTime || msg.ttft) && (
                                    <div className="text-[10px] text-slate-500 font-mono">
                                        {(msg as any).totalTime ? `T: ${(msg as any).totalTime}ms ` : ''}
                                        ({planTime ? `P: ${planTime}ms` : ''}{planTime && execTime ? ', ' : ''}{execTime ? `E: ${execTime}ms` : ''})
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return <span key={i}>{part}</span>;
                })}
            </div>
        );
    };

    const visibleMessages = messages.filter(m => !m.hidden);

    return (
        <div className="w-full bg-slate-950 flex flex-col h-full select-none">
            {/* Compact Utility Sub-bar */}
            <div className="px-3 py-1.5 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-1.5">
                    {onModelChange && (
                        <div className="inline-flex rounded-md bg-slate-950 p-0.5 border border-slate-800">
                            <button
                                type="button"
                                onClick={() => onModelChange('local')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                    selectedModel === 'local'
                                        ? 'bg-slate-800 text-slate-100'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                Local AI
                            </button>
                            <button
                                type="button"
                                onClick={() => onModelChange('gemini')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                    selectedModel === 'gemini'
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                Gemini
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {onIndexDatabase && (
                        <button
                            onClick={onIndexDatabase}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Index Database Values for @ Mentions"
                        >
                            <Database size={13} />
                        </button>
                    )}
                    {onClearHistory && visibleMessages.length > 0 && (
                        <button
                            onClick={onClearHistory}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
                            title="Clear Conversation"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Hide Assistant Panel"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages / Empty State */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 select-text">
                {visibleMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center my-auto px-2 py-6 text-center select-none">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center mb-3">
                            <Sparkles size={17} className="text-purple-400" />
                        </div>
                        <div className="text-xs font-semibold text-slate-200 mb-1">
                            PostgreSQL Tuning Copilot
                        </div>
                        <div className="text-[11px] text-slate-500 mb-4 max-w-[240px] leading-relaxed">
                            Ask about your execution plan, test hypothetical indexes, or generate complex SQL.
                        </div>
                        <div className="w-full flex flex-col gap-1.5">
                            {STARTER_PROMPTS.map((item, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    disabled={loading || aiState !== 'idle'}
                                    onClick={() => onSend(item.prompt)}
                                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 hover:text-white transition-all flex items-center justify-between group"
                                >
                                    <span className="truncate">{item.label}</span>
                                    <span className="text-slate-600 group-hover:text-blue-400 transition-colors ml-2">→</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    visibleMessages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex flex-col ${
                                msg.role === 'user' ? 'self-end max-w-[88%]' : 'self-start w-full'
                            }`}
                        >
                            <div
                                className={`relative px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-sm'
                                }`}
                            >
                                {renderMessageContent(msg, i)}

                                {/* Progress Bar for Pending User Message */}
                                {msg.role === 'user' && (loading || aiState !== 'idle') && i === visibleMessages.length - 1 && (
                                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-white/15 overflow-hidden rounded-b-xl">
                                        <div
                                            style={{
                                                width: '40%',
                                                height: '100%',
                                                background: '#93c5fd',
                                                position: 'absolute',
                                                left: '-40%',
                                                animation: 'indeterminate 1.5s infinite linear'
                                            }}
                                        />
                                        <style>{`
                                            @keyframes indeterminate {
                                                0% { left: -40%; width: 40%; }
                                                50% { left: 100%; width: 40%; }
                                                100% { left: 100%; width: 40%; }
                                            }
                                        `}</style>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div className="p-2.5 border-t border-slate-800/80 bg-slate-950 relative">
                {showSuggestions && (
                    <div className="absolute bottom-full left-2.5 right-2.5 mb-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-[180px] overflow-y-auto z-20">
                        {suggestions.map((s, idx) => (
                            <div
                                key={idx}
                                onClick={() => insertSuggestion(s)}
                                className={`px-3 py-1.5 border-b border-slate-800 cursor-pointer flex justify-between items-center text-xs ${
                                    idx === suggestionIndex ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                                }`}
                            >
                                <span className="text-slate-200 font-semibold font-mono">{s.value}</span>
                                <span className="text-[10px] text-slate-400">{s.meta}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="relative flex items-end bg-slate-900 border border-slate-800 focus-within:border-blue-500/60 rounded-lg transition-colors">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => {
                            const val = e.target.value;
                            setInput(val);
                            if (!hasWarmedUp && val.trim().length > 0) {
                                setHasWarmedUp(true);
                                warmupModel(selectedModel);
                            }
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={loading || aiState !== 'idle'}
                        placeholder={
                            (loading || aiState !== 'idle')
                                ? (aiState === 'generating' ? "Generating response..." : "Analyzing...")
                                : "Ask about SQL, indexes, or @table..."
                        }
                        rows={2}
                        className="flex-1 bg-transparent text-slate-200 placeholder-slate-500 px-3 py-2 pr-9 text-xs outline-none resize-none font-sans leading-relaxed"
                    />

                    <button
                        onClick={handleSend}
                        disabled={loading || aiState !== 'idle' || !input.trim()}
                        className={`m-1.5 p-1.5 rounded-md transition-colors flex items-center justify-center ${
                            input.trim() && !loading && aiState === 'idle'
                                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                                : 'bg-slate-800 text-slate-600 cursor-default'
                        }`}
                        title="Send (Enter)"
                    >
                        <Send size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIChatSidebar;

