import React, { useRef, useEffect, useState } from 'react';
import { warmupModel, autocomplete } from '../api';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    status?: 'success' | 'error' | 'pending';
    hidden?: boolean;
    respTime?: string; // AI Generation Time
    ttft?: string; // Time to First Token
    planTime?: string; // DB Plan Time
    execTime?: string; // DB Exec Time
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
}

const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
    messages, onClose, onSend, loading, aiState = 'idle', title = "Query Discussion", onRunSql,
    selectedModel = "qwen2.5-coder:latest", onModelChange,
    googleApiKey = '', onSetGoogleApiKey, onOpenSettings, onClearHistory, onIndexDatabase,
    connectionInfo
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

    // Check for autocomplete trigger
    useEffect(() => {
        if (!input || !connectionInfo) {
            setShowSuggestions(false);
            return;
        }

        // Find cursor position
        const cursor = inputRef.current?.selectionStart || 0;
        const textBeforeRequest = input.slice(0, cursor);
        const lastWord = textBeforeRequest.split(/\s/).pop() || '';

        if (lastWord.startsWith('@') && lastWord.length >= 3) {
            const term = lastWord.substring(1); // Remove @
            // TODO: Extract table context if syntax is @Table:Term? 
            // For now, assuming Global search or Table search based on term

            // Debounce or just fire? 
            // Simulating debounce with timeout could be better but let's try direct for responsiveness
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

        // Replace last word (the @term) with the value
        const newTextBefore = textBefore.slice(0, -lastWord.length);
        const insertion = s.type === 'table' ? s.value : `${s.value} (ID: ${s.meta.match(/ID: (.*?)\)/)?.[1] || '?'})`;
        // Or just the value? Prompt said "complete the name". Adding ID helps context.

        setInput(newTextBefore + insertion + " " + textAfter);
        setShowSuggestions(false);
        inputRef.current.focus();
    };

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, aiState]);
    // ... (rest of logic) ...

    const handleSend = () => {
        if (input.trim() && !loading && aiState === 'idle') {
            onSend(input);
            setInputHistory(prev => [...prev, input]);
            setHistoryIndex(-1);
            setInput('');
            setHasWarmedUp(false); // Reset for next interaction
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
            // ... (user message logic unchanged) ...
            // Look ahead for SQL in the next message
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
                    style={{
                        whiteSpace: 'pre-wrap',
                        cursor: associatedSql ? 'pointer' : 'default',
                        opacity: associatedSql ? 1 : 0.9
                    }}
                    title={associatedSql ? "Click to load this query" : undefined}
                >
                    {content}
                    {associatedSql && <span style={{ fontSize: '10px', marginLeft: '6px', color: '#68d391' }}>↺</span>}
                </div>
            );
        }

        // Assistant: Hide SQL Blocks as requested
        const parts = content.split(/(```[\w]*[\s\S]*?```)/g);

        return (
            <div style={{ whiteSpace: 'pre-wrap' }}>
                {parts.map((part, i) => {
                    const isCodeBlock = part.startsWith('```');

                    if (isCodeBlock) {
                        const sql = part.replace(/^```[\w]*\n?|```$/g, '').trim();
                        if (!sql) return null;

                        // Extract first line for preview
                        const firstLine = sql.split('\n')[0].substring(0, 50) + (sql.length > 50 ? '...' : '');

                        return (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    margin: '4px 0',
                                }}
                            >
                                <div
                                    onClick={() => { if (onRunSql) onRunSql(sql); }}
                                    style={{
                                        cursor: 'pointer',
                                        color: '#60a5fa',
                                        fontSize: '13px',
                                        fontFamily: 'monospace',
                                        textDecoration: 'none',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                    title="Click to load SQL"
                                >
                                    <span style={{ fontSize: '14px' }}>📄</span>
                                    <span>{firstLine}</span>
                                </div>

                                {(respTime || planTime || execTime || msg.ttft) && (
                                    <div style={{ fontSize: '10px', color: '#64748b', marginLeft: '24px' }}>
                                        {/* Format: T: 86.83 ms (P: 8.42ms, E: 78.41ms) */}
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

    return (
        <div style={{
            width: '100%',
            // borderLeft: '1px solid #334155', // Handled by parent
            background: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
        }}>
            <div style={{
                padding: '10px',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>{title}</h3>
                    {onModelChange && (
                        <select
                            value={selectedModel}
                            onChange={(e) => onModelChange(e.target.value)}
                            style={{
                                background: '#1e293b',
                                color: '#94a3b8',
                                border: '1px solid #334155',
                                borderRadius: '4px',
                                fontSize: '10px',
                                padding: '2px 4px',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="local">Local AI (Ollama)</option>
                            <option value="gemini">Google Gemini</option>
                        </select>
                    )}
                    {/* Key Input Removed - Managed in Settings */}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {onIndexDatabase && (
                        <button
                            onClick={onIndexDatabase}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
                            title="Index Database for Search"
                        >
                            🔍
                        </button>
                    )}
                    {onOpenSettings && (
                        <button
                            onClick={onOpenSettings}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
                            title="Global Settings (DB & AI)"
                        >
                            ⚙️
                        </button>
                    )}
                    {onClearHistory && (
                        <button
                            onClick={onClearHistory}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
                            title="Clear History"
                        >
                            🗑️
                        </button>
                    )}
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>✕</button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '20px' }}>
                        No history yet. Ask a question!
                    </div>
                )}
                {messages.filter(m => !m.hidden).map((msg, i) => (
                    <div key={i} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '90%',
                        width: msg.role === 'assistant' ? '100%' : 'auto' // Allow assistant messages to expand for code blocks
                    }}>
                        <div style={{
                            background: msg.role === 'user' ? '#1d4ed8' : '#1e293b',
                            color: msg.role === 'user' ? 'white' : '#cbd5e1',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            lineHeight: '1.4',
                            borderTopRightRadius: msg.role === 'user' ? 0 : 8,
                            borderTopLeftRadius: msg.role === 'assistant' ? 0 : 8,
                            border: msg.role === 'assistant' ? '1px solid #334155' : 'none',
                            position: 'relative'
                        }}>
                            {renderMessageContent(msg, i)}
                            {/* Success Tick for User Messages that triggered an update */}
                            {msg.role === 'user' && (msg as any).status === 'success' && (
                                <div style={{
                                    position: 'absolute',
                                    left: '-20px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: '#4ade80',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }} title="Completed">
                                    ✓
                                </div>
                            )}

                            {/* Progress Bar for Pending User Message */}
                            {msg.role === 'user' && (loading || aiState !== 'idle') && i === messages.filter(m => !m.hidden).length - 1 && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '3px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    overflow: 'hidden',
                                    borderBottomRightRadius: '8px', // Matched with container
                                    borderBottomLeftRadius: '8px',
                                }}>
                                    <div style={{
                                        width: '40%',
                                        height: '100%',
                                        background: '#60a5fa', // Blue-400
                                        position: 'absolute',
                                        left: '-40%',
                                        animation: 'indeterminate 1.5s infinite linear'
                                    }} />
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
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                            {msg.role === 'user' ? 'You' : 'AI'}
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '10px', borderTop: '1px solid #1e293b', background: '#0f172a', position: 'relative' }}>
                {showSuggestions && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '10px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
                        width: '300px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 10
                    }}>
                        {suggestions.map((s, idx) => (
                            <div
                                key={idx}
                                onClick={() => insertSuggestion(s)}
                                style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #334155',
                                    cursor: 'pointer',
                                    background: idx === suggestionIndex ? '#334155' : 'transparent',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{s.value}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{s.meta}</div>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
                        placeholder={(loading || aiState !== 'idle') ? (aiState === 'generating' ? "Generating..." : "Thinking...") : "Ask AI..."}
                        rows={2}
                        style={{
                            flex: 1,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#e2e8f0',
                            padding: '8px 10px',
                            paddingRight: '64px',
                            borderRadius: '4px',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                            resize: 'none',
                            fontFamily: 'inherit'
                        }}
                    />

                    <button
                        onClick={handleSend}
                        disabled={loading || aiState !== 'idle' || !input.trim()}
                        style={{
                            position: 'absolute',
                            right: '5px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: input.trim() && !loading && aiState === 'idle' ? '#3b82f6' : '#334155',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: input.trim() && !loading && aiState === 'idle' ? 'pointer' : 'default',
                            transition: 'background 0.2s'
                        }}
                        title="Send"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>

                    <div style={{
                        position: 'absolute',
                        right: '35px',
                        bottom: '50%',
                        transform: 'translateY(50%)',
                        fontSize: '10px',
                        color: '#64748b',
                        pointerEvents: 'none',
                        opacity: 0.5
                    }}>
                        ↵
                    </div>
                </div>
            </div>
        </div >
    );
};

export default AIChatSidebar;
