import React, { useState, useRef, useEffect } from 'react';
import { format } from 'sql-formatter';

const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
};

const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";  // Avoid scrolling to bottom
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
};

interface Message {
    role: 'user' | 'assistant';
    content: string;
    isCode?: boolean;
    prompt?: string;
    duration?: string;
}

interface AIAssistantProps {
    schema: any;
    onApplyCode: (code: string) => void;
    connectionInfo: any;
    onStreamCode?: (code: string) => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ schema, onApplyCode, connectionInfo, onStreamCode }) => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const saved = localStorage.getItem('pgray_chat_history');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse chat history", e);
            }
        }
        return [{ role: 'assistant', content: "Hi! I'm your SQL Assistant. Ask me to write queries for you based on the schema." }];
    });
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPromptIdx, setShowPromptIdx] = useState<number | null>(null);
    const [model, setModel] = useState<string>("qwen2.5-coder:14b");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleApply = (code: string) => {
        try {
            const formatted = format(code, { language: 'postgresql' });
            onApplyCode(formatted);
        } catch (e) {
            console.error("Formatting failed", e);
            onApplyCode(code); // Fallback to raw
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        localStorage.setItem('pgray_chat_history', JSON.stringify(messages));
    }, [messages]);

    const clearHistory = () => {
        if (confirm("Clear chat history?")) {
            setMessages([{ role: 'assistant', content: "Hi! I'm your SQL Assistant. Ask me to write queries for you based on the schema." }]);
            localStorage.removeItem('pgray_chat_history');
        }
    };

    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px'; // Max height 150px
        }
    }, [input]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);
        setHistoryIndex(-1);
        const startTime = performance.now();

        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }

        try {
            const response = await fetch('http://localhost:9000/api/generate_sql_stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userMsg,
                    schema_data: schema,
                    history: messages,
                    model: model,
                    connection: connectionInfo
                })
            });

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let currentContent = "";

            const isDirectStream = !!onStreamCode;

            if (!isDirectStream) {
                setMessages(prev => [...prev, { role: 'assistant', content: "" }]);
            }

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    currentContent += chunk;

                    if (isDirectStream) {
                        // Strip Markdown (```sql ... ```)
                        let cleanText = currentContent.replace(/^```sql\s*|^```\s*/i, '');
                        // Also strip trailing markdown if it resembles the end block
                        cleanText = cleanText.replace(/\s*```$/, '');

                        onStreamCode(cleanText);
                    } else {
                        setMessages(prev => {
                            const newMsgs = [...prev];
                            const lastMsg = newMsgs[newMsgs.length - 1];
                            if (lastMsg.role === 'assistant') {
                                lastMsg.content = currentContent;
                            }
                            return newMsgs;
                        });
                    }
                }
            }

            if (!isDirectStream) {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    lastMsg.content = currentContent;
                    return newMsgs;
                });
            }

        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Error communicating with AI." }]);
        } finally {
            setLoading(false);
            const endTime = performance.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2) + 's';

            // Update the User message with duration
            setMessages(prev => {
                const newMsgs = [...prev];
                // Find the last user message (it should be the second to last, or verify by role)
                for (let i = newMsgs.length - 1; i >= 0; i--) {
                    if (newMsgs[i].role === 'user' && !newMsgs[i].duration) {
                        newMsgs[i] = { ...newMsgs[i], duration: duration };
                        break;
                    }
                }
                return newMsgs;
            });
        }
    };

    // History Navigation
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [tempInput, setTempInput] = useState('');

    const userHistory = messages.filter(m => m.role === 'user').map(m => m.content).reverse();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
            setHistoryIndex(-1);
            setTempInput('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nextIndex = historyIndex + 1;
            if (nextIndex < userHistory.length) {
                if (historyIndex === -1) setTempInput(input); // Save current draft
                setHistoryIndex(nextIndex);
                setInput(userHistory[nextIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = historyIndex - 1;
            if (nextIndex >= 0) {
                setHistoryIndex(nextIndex);
                setInput(userHistory[nextIndex]);
            } else if (nextIndex === -1) {
                setHistoryIndex(-1);
                setInput(tempInput); // Restore draft
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', borderLeft: '1px solid #334155', position: 'relative' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#a855f7', margin: 0 }}>Create Query with AI:</h3>
                    <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        style={{
                            background: '#1e293b',
                            color: '#cbd5e1',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            fontSize: '11px',
                            padding: '2px 4px',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="qwen2.5-coder">qwen2.5-coder (7b)</option>
                        <option value="qwen2.5-coder:14b">qwen2.5-coder:14b</option>
                        <option value="sqlcoder">sqlcoder</option>
                        <option value="llama3">llama3</option>
                        <option value="mistral">mistral</option>
                    </select>
                </div>
                <button
                    onClick={clearHistory}
                    title="Clear History"
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}
                >
                    🗑️
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '90%'
                    }}>
                        <div style={{
                            background: msg.role === 'user' ? '#2563eb' : '#1e293b',
                            color: '#e2e8f0',
                            padding: '10px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            borderTopRightRadius: msg.role === 'user' ? 0 : 8,
                            borderTopLeftRadius: msg.role === 'assistant' ? 0 : 8,
                        }}>
                            {msg.role === 'user' ? (
                                <>
                                    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{msg.content}</div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', textAlign: 'right' }}>
                                        {msg.duration ? msg.duration : 'You'}
                                    </div>
                                </>
                            ) : (
                                <div>
                                    {(() => {
                                        // 1. Try Markdown Split
                                        if (msg.content.includes('```')) {
                                            return msg.content.split(/(```[\s\S]*?```)/g).map((part, i) => {
                                                if (part.startsWith('```')) {
                                                    const code = part.replace(/^```\w*\n?/, '').replace(/```$/, '').trim();
                                                    if (!code) return null;
                                                    return (
                                                        <div key={i} style={{ marginTop: '8px', marginBottom: '8px' }}>
                                                            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', overflowX: 'auto', border: '1px solid #334155', fontFamily: 'monospace', fontSize: '12px' }}>
                                                                {code}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                                                                <button
                                                                    onClick={() => copyToClipboard(code)}
                                                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                    title="Copy to Clipboard"
                                                                >
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleApply(code)}
                                                                    style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                    title="Apply to SQL Editor"
                                                                >
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <path d="M19 12H5"></path>
                                                                        <polyline points="12 19 5 12 12 5"></polyline>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                } else {
                                                    if (!part.trim()) return null;
                                                    return <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: '5px' }}>{part}</div>;
                                                }
                                            });
                                        }

                                        // 2. Fallback: Extract Raw SQL from Text (if no backticks)
                                        // Look for typical SQL start keywords preceded by newline or start of string
                                        const rawSqlMatch = msg.content.match(/(\n|^)\s*(WITH|SELECT)\s+[\s\S]+/i);

                                        if (rawSqlMatch && rawSqlMatch.index !== undefined) {
                                            // Split into Text (Description) and Code
                                            // Adjust index to start of the keyword (skip newline if matched)
                                            const matchIndex = rawSqlMatch.index + (rawSqlMatch[1] === '\n' ? 1 : 0);

                                            const textPart = msg.content.substring(0, matchIndex).trim();
                                            const codePart = msg.content.substring(matchIndex).trim();

                                            return (
                                                <>
                                                    {textPart && <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{textPart}</div>}
                                                    <div style={{ marginTop: '5px', marginBottom: '5px' }}>
                                                        <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', overflowX: 'auto', border: '1px solid #334155', fontFamily: 'monospace', fontSize: '12px' }}>
                                                            {codePart}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                                                            <button
                                                                onClick={() => copyToClipboard(codePart)}
                                                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                title="Copy to Clipboard"
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleApply(codePart)}
                                                                style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                title="Apply to SQL Editor"
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M19 12H5"></path>
                                                                    <polyline points="12 19 5 12 12 5"></polyline>
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        }

                                        // 3. Default: Just text
                                        return <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>;
                                    })()}

                                    {/* Debug Button */}
                                    {msg.prompt && (
                                        <div style={{ marginTop: '10px', borderTop: '1px solid #334155', paddingTop: '5px' }}>
                                            <button
                                                onClick={() => setShowPromptIdx(idx)}
                                                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                🐞 Debug Prompt
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}



                {loading && (!messages.length || messages[messages.length - 1].role !== 'assistant' || !messages[messages.length - 1].content) && (
                    <div style={{ padding: '0 10px 10px 10px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', marginBottom: '6px' }}>Thinking...</div>
                        <div style={{ height: '2px', background: '#334155', borderRadius: '2px', overflow: 'hidden', maxWidth: '200px' }}>
                            <div style={{
                                width: '30%',
                                height: '100%',
                                background: '#a855f7',
                                borderRadius: '2px',
                                animation: 'loading-bar 1.5s infinite linear'
                            }} />
                        </div>
                        <style>{`
                            @keyframes loading-bar {
                                0% { margin-left: -30%; }
                                100% { margin-left: 100%; }
                            }
                        `}</style>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Prompt Modal */}
            {showPromptIdx !== null && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 10, padding: '20px', display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ background: '#1e293b', flex: 1, borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '10px', background: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '12px' }}>System Prompt Debug</span>
                            <button onClick={() => setShowPromptIdx(null)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '10px', color: '#a5b4fc', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
                            {messages[showPromptIdx]?.prompt}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ padding: '15px', borderTop: '1px solid #1e293b', background: '#0f172a' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask for a query..."
                        disabled={loading}
                        rows={1}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#e2e8f0',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            resize: 'none',
                            minHeight: '40px',
                            maxHeight: '150px',
                            overflowY: 'auto',
                            fontFamily: 'inherit'
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading}
                        style={{
                            background: '#a855f7',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            width: '40px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        ➤
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIAssistant;
