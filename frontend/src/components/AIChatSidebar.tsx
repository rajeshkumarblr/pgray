import React, { useRef, useEffect, useState } from 'react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    status?: 'success' | 'error' | 'pending';
}

interface AIChatSidebarProps {
    messages: Message[];
    onClose: () => void;
    onSend: (msg: string) => void;
    loading?: boolean;
}

const AIChatSidebar: React.FC<AIChatSidebarProps> = ({ messages, onClose, onSend, loading }) => {
    const endRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState('');
    const [inputHistory, setInputHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (input.trim() && !loading) {
            onSend(input);
            setInputHistory(prev => [...prev, input]);
            setHistoryIndex(-1); // Reset history pointer
            setInput('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        } else if (e.key === 'ArrowUp' && e.ctrlKey) {
            // Navigate Back
            e.preventDefault();
            if (inputHistory.length > 0) {
                const newIndex = historyIndex === -1 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(newIndex);
                setInput(inputHistory[newIndex]);
            }
        } else if (e.key === 'ArrowDown' && e.ctrlKey) {
            // Navigate Forward
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

    return (
        <div style={{
            width: '300px',
            borderLeft: '1px solid #334155',
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
                <h3 style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>Context History</h3>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '20px' }}>
                        No history yet. Ask a question!
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '90%'
                    }}>
                        <div style={{
                            background: msg.role === 'user' ? '#2563eb' : '#1e293b',
                            color: '#e2e8f0',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            borderTopRightRadius: msg.role === 'user' ? 0 : 8,
                            borderTopLeftRadius: msg.role === 'assistant' ? 0 : 8,
                            border: msg.role === 'assistant' ? '1px solid #334155' : 'none',
                            position: 'relative'
                        }}>
                            {msg.content}
                            {/* Success Tick for User Messages that triggered an update */}
                            {msg.role === 'user' && (msg as any).status === 'success' && (
                                <div style={{
                                    position: 'absolute',
                                    left: '-24px', // Moved to left
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: '#4ade80',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }} title="SQL Updated">
                                    ✓
                                </div>
                            )}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                            {msg.role === 'user' ? 'You' : 'AI'}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                        <div style={{
                            background: '#1e293b',
                            color: '#94a3b8',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            borderTopLeftRadius: 0,
                            border: '1px solid #334155',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px'
                        }}>
                            <span>Thinking...</span>
                            <div style={{
                                height: '2px',
                                width: '100%',
                                background: '#334155',
                                borderRadius: '2px',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                <div className="progress-bar-animate" style={{
                                    height: '100%',
                                    background: '#3b82f6',
                                    width: '50%',
                                    position: 'absolute',
                                    left: 0,
                                    top: 0
                                }} />
                            </div>
                            <style>{`
                                @keyframes indeterminate {
                                    0% { left: -50%; width: 50%; }
                                    50% { left: 25%; width: 50%; }
                                    100% { left: 100%; width: 50%; }
                                }
                                .progress-bar-animate {
                                    animation: indeterminate 1.5s infinite linear;
                                }
                             `}</style>
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '10px', borderTop: '1px solid #1e293b', background: '#0f172a' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        placeholder={loading ? "Thinking..." : "Ask AI..."}
                        rows={2}
                        style={{
                            flex: 1,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#e2e8f0',
                            padding: '8px 10px',
                            paddingRight: '64px', // Space for Send Button + Icon
                            borderRadius: '4px',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                            resize: 'none',
                            fontFamily: 'inherit'
                        }}
                    />

                    {/* Send Button */}
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        style={{
                            position: 'absolute',
                            right: '5px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: input.trim() && !loading ? '#3b82f6' : '#334155',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: input.trim() && !loading ? 'pointer' : 'default',
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
        </div>
    );
};

export default AIChatSidebar;
