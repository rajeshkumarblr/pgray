import React, { useState } from 'react';
import SchemaBrowser from '../workspace/SchemaBrowser';
import ERDiagram from '../ERDiagram';
import { Database, GitBranch } from 'lucide-react';

interface DesignTabProps {
    schema: any;
    loadingSchema: boolean;
    connectionInfo: any;
}

const DesignTab: React.FC<DesignTabProps> = ({ schema, loadingSchema, connectionInfo }) => {
    const [activeSubTab, setActiveSubTab] = useState<'browser' | 'diagram'>('browser');
    const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());

    const subTabStyle = (tab: string) => ({
        padding: '8px 20px',
        cursor: 'pointer',
        color: activeSubTab === tab ? '#e2e8f0' : '#64748b',
        borderBottom: activeSubTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
        fontWeight: activeSubTab === tab ? 600 : 500,
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.15s ease'
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
            {/* Sub-Tab Header */}
            <div style={{
                display: 'flex',
                background: '#1e293b',
                borderBottom: '1px solid #334155',
                paddingLeft: '10px'
            }}>
                <div
                    onClick={() => setActiveSubTab('browser')}
                    style={subTabStyle('browser') as React.CSSProperties}
                >
                    <Database size={14} />
                    Browser
                </div>
                <div
                    onClick={() => setActiveSubTab('diagram')}
                    style={subTabStyle('diagram') as React.CSSProperties}
                >
                    <GitBranch size={14} />
                    ER Diagram
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {activeSubTab === 'browser' && (
                    <SchemaBrowser
                        schema={schema}
                        loadingSchema={loadingSchema}
                        connectionInfo={connectionInfo}
                        selectedTables={selectedTables}
                        setSelectedTables={setSelectedTables}
                        onShowER={() => setActiveSubTab('diagram')}
                    />
                )}

                {activeSubTab === 'diagram' && (
                    <ERDiagram
                        schema={schema}
                        connectionInfo={connectionInfo}
                        active={activeSubTab === 'diagram'}
                    />
                )}
            </div>
        </div>
    );
};

export default DesignTab;
