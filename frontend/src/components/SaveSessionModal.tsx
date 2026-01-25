import React, { useEffect, useState } from 'react';

interface Parameter {
    name: string;
    original_value: string;
    active: boolean;
}

interface SaveSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (title: string, sql: string, params: string[]) => void;

    // Initial Data from Analysis
    initialTitle: string;
    initialParams: Parameter[];
    originalSql: string;
}

const SaveSessionModal: React.FC<SaveSessionModalProps> = ({ isOpen, onClose, onSave, initialTitle, initialParams, originalSql }) => {
    const [title, setTitle] = useState(initialTitle);
    const [params, setParams] = useState<Parameter[]>(initialParams);
    const [previewSql, setPreviewSql] = useState(originalSql);

    useEffect(() => {
        setTitle(initialTitle);
        setParams(initialParams.map(p => ({ ...p, active: true }))); // Default all active
    }, [initialTitle, initialParams]);

    // Update Preview SQL based on active parameters
    useEffect(() => {
        let sql = originalSql;
        params.forEach(p => {
            if (p.active) {
                // Ensure we replace only exact matches if possible, or simple replace
                // original_value is likely quoted like "'Tom Hanks'"
                // If it's a string literal, we replace it.
                // Simple Replace for MVP - careful with overlapping values
                sql = sql.replace(p.original_value, `:${p.name}`);
            }
        });
        setPreviewSql(sql);
    }, [params, originalSql]);

    const handleSave = () => {
        const activeParamNames = params.filter(p => p.active).map(p => p.name);
        onSave(title, previewSql, activeParamNames);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div style={{
                background: '#1e293b', borderRadius: '8px', padding: '24px', width: '600px',
                border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }}>
                <h2 style={{ margin: '0 0 20px 0', color: '#f8fafc', fontSize: '18px' }}>Save Query with parameters</h2>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>Query Name</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        style={{
                            width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #334155',
                            background: '#0f172a', color: 'white', fontSize: '14px'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>Detected Parameters (Uncheck to keep hardcoded)</label>
                    <div style={{ background: '#0f172a', borderRadius: '4px', padding: '10px', border: '1px solid #334155', maxHeight: '150px', overflowY: 'auto' }}>
                        {params.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>No parameters detected.</div>
                        ) : (
                            params.map((param, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx < params.length - 1 ? '1px solid #1e293b' : 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input
                                            type="checkbox"
                                            checked={param.active}
                                            onChange={(e) => {
                                                const newParams = [...params];
                                                newParams[idx].active = e.target.checked;
                                                setParams(newParams);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: '13px' }}>{param.original_value}</span>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
                                        <span style={{ color: '#a5b4fc', fontFamily: 'monospace', fontSize: '13px' }}>:{param.name}</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={param.name}
                                        onChange={(e) => {
                                            const newParams = [...params];
                                            newParams[idx].name = e.target.value;
                                            setParams(newParams);
                                        }}
                                        style={{
                                            background: '#334155', border: 'none', color: '#e2e8f0',
                                            padding: '2px 6px', borderRadius: '4px', fontSize: '12px', width: '120px'
                                        }}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>Preview SQL</label>
                    <div style={{
                        background: '#0f172a', padding: '10px', borderRadius: '4px',
                        border: '1px solid #334155', height: '100px', overflowY: 'auto'
                    }}>
                        <pre style={{ margin: 0, fontFamily: 'monospace', color: '#cbd5e1', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                            {previewSql}
                        </pre>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '4px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} style={{ padding: '8px 16px', borderRadius: '4px', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save Query</button>
                </div>
            </div>
        </div>
    );
};

export default SaveSessionModal;
