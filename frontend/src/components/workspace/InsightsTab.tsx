import React from 'react';

interface Insight {
    id: string;
    sql: string;
    description?: string;
}

interface InsightsTabProps {
    insights: Insight[];
    onRunInsight: (id: string, sql: string) => void;
    // Granular results map
    insightResults: { [id: string]: { status: 'success' | 'error', message: string } };
}

const InsightsTab: React.FC<InsightsTabProps> = ({ insights, onRunInsight, insightResults }) => {
    if (!insights || insights.length === 0) {
        return (
            <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
                No actionable insights generated yet. <br />
                Right-click a node in the Analyze tab and select "Analyze with AI" to get suggestions.
            </div>
        );
    }

    return (
        <div style={{ height: '100%', overflowY: 'auto', padding: '10px' }}>
            {insights.map((insight) => {
                const result = insightResults[insight.id];
                const isSuccess = result?.status === 'success';
                const isError = result?.status === 'error';

                return (
                    <div key={insight.id} style={{
                        background: '#1e293b',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        border: isSuccess ? '1px solid #10b981' : isError ? '1px solid #ef4444' : '1px solid #334155',
                        overflow: 'hidden'
                    }}>
                        {insight.description && (
                            <div style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #334155',
                                background: '#0f172a',
                                color: '#e2e8f0',
                                fontSize: '13px',
                                fontWeight: 500,
                                display: 'flex', justifyContent: 'space-between'
                            }}>
                                <span>{insight.description}</span>
                                {isSuccess && <span style={{ color: '#10b981', fontSize: '11px' }}>✓ Applied</span>}
                                {isError && <span style={{ color: '#ef4444', fontSize: '11px' }}>✕ Failed</span>}
                            </div>
                        )}
                        <div style={{ padding: '10px', background: '#0f172a' }}>
                            <pre style={{
                                margin: 0,
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                color: '#a5b4fc',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all'
                            }}>
                                {insight.sql}
                            </pre>
                        </div>
                        <div style={{ padding: '8px', display: 'flex', justifyContent: 'flex-end', background: '#1e293b', gap: '10px', alignItems: 'center' }}>
                            {result && <span style={{ fontSize: '11px', color: isSuccess ? '#10b981' : '#ef4444' }}>{result.message}</span>}
                            <button
                                onClick={() => onRunInsight(insight.id, insight.sql)}
                                title="Execute this command"
                                style={{
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    opacity: 1
                                }}
                            >
                                Run Action
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default InsightsTab;
