
import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Sparkles } from 'lucide-react';
import { streamChat } from '../api';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    isError?: boolean;
    isTyping?: boolean;
}

interface AskChatProps {
    connectionInfo: any;
    sql: string;
    initialExplanation?: string | null;
    model?: string;
}

const AskChat: React.FC<AskChatProps> = ({ connectionInfo, sql, initialExplanation, model }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initialize with explanation
    useEffect(() => {
        if (initialExplanation) {
            setMessages([{
                id: 'init-expl',
                role: 'assistant',
                content: initialExplanation
            }]);
        } else {
            setMessages([]);
        }
    }, [initialExplanation]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        // Add placeholder bot message
        const botMsgId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, { id: botMsgId, role: 'assistant', content: '', isTyping: true }]);

        try {
            // Context Builder
            const fullPrompt = `Context: The user is asking about this SQL Query:\n\`\`\`sql\n${sql}\n\`\`\`\n\nUser Question: ${input}`;

            await streamChat(
                fullPrompt,
                {
                    connection: connectionInfo,
                    sql_query: sql, // Backend might use this
                    model: model || 'gemini-2.0-flash-exp' // Default fallback
                },
                (chunk) => {
                    setMessages(prev => prev.map(m =>
                        m.id === botMsgId
                            ? { ...m, content: m.content + chunk, isTyping: false }
                            : m
                    ));
                }
            );
        } catch (error) {
            setMessages(prev => prev.map(m =>
                m.id === botMsgId
                    ? { ...m, content: "Sorry, I couldn't process that request.", isError: true, isTyping: false }
                    : m
            ));
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
            {/* Header */}
            <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex items-center gap-2">
                <Sparkles size={14} className="text-purple-400" />
                <span className="text-sm font-medium text-slate-300">SQL assistant</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="text-center text-slate-500 text-sm mt-10">
                        Ask follow-up questions about your data...
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`
                            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                            ${msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'}
                        `}>
                            {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                        </div>

                        <div className={`
                            max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed
                            ${msg.role === 'user' ? 'bg-blue-600/20 text-blue-100 rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}
                            ${msg.isError ? 'border border-red-500/50 bg-red-900/20 text-red-200' : ''}
                        `}>
                            <div className="whitespace-pre-wrap">
                                {/* Simple Markdown Bold Parser */}
                                {msg.content.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                    part.startsWith('**') && part.endsWith('**')
                                        ? <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>
                                        : part
                                )}
                                {msg.isTyping && <span className="animate-pulse ml-1">▋</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-800 bg-slate-900">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a follow-up..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors resize-none custom-scrollbar"
                        rows={1}
                        style={{ minHeight: '44px', maxHeight: '120px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 bottom-2 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AskChat;
