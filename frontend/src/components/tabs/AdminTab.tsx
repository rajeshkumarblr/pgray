import React, { useState, useEffect } from 'react';
import { getServerSettings } from '../../api';

interface AdminTabProps {
    connectionInfo: any;
}

const AdminTab: React.FC<AdminTabProps> = ({ connectionInfo }) => {
    const [settings, setSettings] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (connectionInfo) {
            setLoading(true);
            getServerSettings(connectionInfo)
                .then(data => setSettings(data.data))
                .catch(err => console.error("Settings fetch error", err))
                .finally(() => setLoading(false));
        }
    }, [connectionInfo]);

    return (
        <div style={{ padding: '20px', color: '#e2e8f0', height: '100%', overflowY: 'auto', background: '#0f172a' }}>
            <h2 style={{ borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '20px' }}>Server Configuration & Health</h2>

            {/* AI Advisor Stub */}
            <div style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', border: '1px solid #475569', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, marginBottom: '10px', color: '#a855f7' }}>AI Tuning Advisor</h3>
                <p style={{ fontSize: '13px', color: '#cbd5e1' }}>
                    Based on your workload, consider adjusting <strong>shared_buffers</strong> and <strong>work_mem</strong>. (Placeholder)
                </p>
            </div>

            {loading && <div>Loading settings...</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {settings.map((setting) => (
                    <div key={setting.name} style={{ background: '#1e293b', padding: '10px', borderRadius: '6px', border: '1px solid #334155' }}>
                        <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: '4px' }}>{setting.name}</div>
                        <div style={{ fontSize: '14px', marginBottom: '4px' }}>{setting.setting} <span style={{ color: '#64748b', fontSize: '12px' }}>{setting.unit}</span></div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{setting.short_desc}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminTab;

