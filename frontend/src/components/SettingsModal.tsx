import React, { useState, useEffect } from 'react';
import { getAIModels } from '../api';

interface ConnectionInfo {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    schema: string;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // DB
    connectionInfo: ConnectionInfo | null;
    onConnect: (info: ConnectionInfo) => void;
    // AI
    ollamaUrl: string;
    onSaveOllamaUrl: (url: string) => void;
    geminiKey: string;
    onSaveGeminiKey: (key: string) => void;
    geminiModel: string;
    onSaveGeminiModel: (model: string) => void;
    localModel: string;
    onSaveLocalModel: (model: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose,
    connectionInfo, onConnect,
    ollamaUrl, onSaveOllamaUrl,
    geminiKey, onSaveGeminiKey,
    geminiModel, onSaveGeminiModel,
    localModel, onSaveLocalModel
}) => {
    const [activeTab, setActiveTab] = useState<'db' | 'ai'>('db');

    // DB State
    const [host, setHost] = useState('host.docker.internal');
    const [port, setPort] = useState(5432);
    const [username, setUsername] = useState('postgres');
    const [password, setPassword] = useState('');
    const [database, setDatabase] = useState('postgres');
    const [schema, setSchema] = useState('public');

    // AI State
    // AI State
    // AI State
    const [localOllamaUrl, setLocalOllamaUrl] = useState('');
    const [localGeminiKey, setLocalGeminiKey] = useState('');
    const [localGeminiModel, setLocalGeminiModel] = useState('');
    const [selectedLocalModel, setSelectedLocalModel] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);

    // Init
    useEffect(() => {
        if (isOpen) {
            if (connectionInfo) {
                setHost(connectionInfo.host);
                setPort(connectionInfo.port);
                setUsername(connectionInfo.username);
                setPassword(connectionInfo.password); // Note: might be empty if we don't persist it in memory? App.tsx connectionInfo should have it.
                setDatabase(connectionInfo.database);
                setSchema(connectionInfo.schema);
            } else {
                // Load defaults
                try {
                    const defs = JSON.parse(localStorage.getItem('pgray_connection_defaults') || '{}');
                    if (defs.host) setHost(defs.host);
                    if (defs.port) setPort(defs.port);
                    if (defs.username) setUsername(defs.username);
                    if (defs.database) setDatabase(defs.database);
                    if (defs.schema) setSchema(defs.schema);
                } catch { }
            }
            setLocalOllamaUrl(ollamaUrl);
            setLocalGeminiKey(geminiKey);
            setLocalGeminiModel(geminiModel || 'gemini-1.5-flash');
            setSelectedLocalModel(localModel);

            // Fetch Models
            getAIModels().then(models => {
                if (models && models.length > 0) {
                    setAvailableModels(models);
                } else {
                    setAvailableModels(["qwen2.5-coder:latest", "llama3", "mistral"]);
                }
            }).catch(() => setAvailableModels(["qwen2.5-coder:latest", "llama3", "mistral"]));
        }
    }, [isOpen, connectionInfo, ollamaUrl, geminiKey, localModel]);

    if (!isOpen) return null;

    const handleDbSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Save defaults
        localStorage.setItem('pgray_connection_defaults', JSON.stringify({ host, port, username, database, schema }));
        onConnect({ host, port, username, password, database, schema });
    };

    const handleAiSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSaveOllamaUrl(localOllamaUrl);
        onSaveGeminiKey(localGeminiKey);
        onSaveGeminiModel(localGeminiModel);
        onSaveLocalModel(selectedLocalModel);
        // Maybe show toast? Caller handles persistence.
        // Close? Maybe just save.
    };

    // Styles
    const modalStyle: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
    };
    const contentStyle: React.CSSProperties = {
        backgroundColor: '#1e293b', padding: '0', borderRadius: '8px', width: '500px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)', color: '#e2e8f0', border: '1px solid #334155', display: 'flex', flexDirection: 'column'
    };
    const tabBtnStyle = (isActive: boolean): React.CSSProperties => ({
        flex: 1, padding: '15px', background: isActive ? '#1e293b' : '#0f172a',
        border: 'none', borderBottom: isActive ? '2px solid #3b82f6' : '1px solid #334155',
        color: isActive ? 'white' : '#94a3b8', cursor: 'pointer', fontWeight: 600
    });
    const fieldStyle: React.CSSProperties = { marginBottom: '15px', display: 'flex', flexDirection: 'column' };
    const inputStyle: React.CSSProperties = {
        padding: '10px', fontSize: '14px', borderRadius: '4px', border: '1px solid #475569',
        backgroundColor: '#0f172a', color: '#fff', outline: 'none', marginTop: '5px'
    };

    return (
        <div style={modalStyle}>
            <div style={contentStyle}>
                <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                    <button style={tabBtnStyle(activeTab === 'db')} onClick={() => setActiveTab('db')}>🔌 Database</button>
                    <button style={tabBtnStyle(activeTab === 'ai')} onClick={() => setActiveTab('ai')}>🤖 AI Configuration</button>
                </div>

                <div style={{ padding: '25px' }}>
                    {activeTab === 'db' ? (
                        <form onSubmit={handleDbSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={fieldStyle}>
                                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>Host</label>
                                    <input type="text" value={host} onChange={e => setHost(e.target.value)} style={inputStyle} required />
                                </div>
                                <div style={fieldStyle}>
                                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>Port</label>
                                    <input type="number" value={port} onChange={e => setPort(Number(e.target.value))} style={inputStyle} required />
                                </div>
                            </div>
                            <div style={fieldStyle}>
                                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Database</label>
                                <input type="text" value={database} onChange={e => setDatabase(e.target.value)} style={inputStyle} required />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={fieldStyle}>
                                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>Username</label>
                                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} required />
                                </div>
                                <div style={fieldStyle}>
                                    <label style={{ fontSize: '13px', color: '#94a3b8' }}>Password</label>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
                                </div>
                            </div>
                            <div style={fieldStyle}>
                                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Schema</label>
                                <input type="text" value={schema} onChange={e => setSchema(e.target.value)} style={inputStyle} required />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                {/* Only show Close if we have a connection, otherwise prompt is blocking? No, allow cancel/close */}
                                <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Connect & Save</button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleAiSubmit}>
                            <div style={fieldStyle}>
                                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Ollama URL</label>
                                <input type="text" value={localOllamaUrl} onChange={e => setLocalOllamaUrl(e.target.value)} placeholder="http://localhost:11434" style={inputStyle} />
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Default: http://localhost:11434</div>
                            </div>

                            <div style={fieldStyle}>
                                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Local AI Model</label>
                                <select
                                    value={selectedLocalModel}
                                    onChange={(e) => setSelectedLocalModel(e.target.value)}
                                    style={{ ...inputStyle, cursor: 'pointer' }}
                                >
                                    {availableModels.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Model used when "Local" is selected in Assistant</div>
                            </div>

                            <div style={fieldStyle}>
                                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Google Gemini API Key</label>
                                <input type="password" value={localGeminiKey} onChange={e => setLocalGeminiKey(e.target.value)} placeholder="AIzaSy..." style={inputStyle} />
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Required for Gemini models</div>
                            </div>

                            <div style={fieldStyle}>
                                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Gemini Model Name</label>
                                <input type="text" value={localGeminiModel} onChange={e => setLocalGeminiModel(e.target.value)} placeholder="gemini-1.5-flash" style={inputStyle} />
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>E.g. gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash-exp</div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
                                <button type="submit" style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Save Settings</button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
