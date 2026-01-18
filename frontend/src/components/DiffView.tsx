import React from 'react';
import * as Diff from 'diff';

interface DiffViewProps {
    oldCode: string;
    newCode: string;
    onClose: () => void;
}

const DiffView: React.FC<DiffViewProps> = ({ oldCode, newCode, onClose }) => {
    const differences = Diff.diffLines(oldCode, newCode);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '14px' }}>
            {/* Header */}
            <div style={{ padding: '10px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
                <span style={{ fontWeight: 'bold' }}>Diff View (Changes from Previous)</span>
                <button
                    onClick={onClose}
                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Back to Editor
                </button>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
                {differences.map((part, index) => {

                    // Dark mode colors:
                    const bgColor = part.added ? 'rgba(34, 197, 94, 0.2)' : part.removed ? 'rgba(239, 68, 68, 0.2)' : 'transparent';
                    const textColor = part.added ? '#4ade80' : part.removed ? '#f87171' : '#cbd5e1';
                    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';

                    return (
                        <div key={index} style={{ backgroundColor: bgColor, color: textColor, whiteSpace: 'pre-wrap', display: 'block' }}>
                            {part.value.replace(/\n$/, '').split('\n').map((line, i) => (
                                <div key={i} style={{ display: 'flex' }}>
                                    <span style={{ width: '20px', userSelect: 'none', opacity: 0.5 }}>{prefix}</span>
                                    <span>{line}</span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DiffView;
