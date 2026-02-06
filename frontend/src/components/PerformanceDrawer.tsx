import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Clock, Database, Sparkles, Wrench } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface PerformanceDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    sql: string;
    metrics: {
        duration: number;
        rowCount: number;
    };
    onTune?: () => void;
}

const PerformanceDrawer: React.FC<PerformanceDrawerProps> = ({
    isOpen,
    onClose,
    sql,
    metrics,
    onTune
}) => {
    // Determine performance status
    let statusColor = 'text-emerald-400';
    let statusBg = 'bg-emerald-500/10';
    let statusLabel = 'Fast';
    let statusIcon = <Zap size={16} />;

    if (metrics.duration > 1000) {
        statusColor = 'text-red-400';
        statusBg = 'bg-red-500/10';
        statusLabel = 'Slow';
        statusIcon = <Clock size={16} />;
    } else if (metrics.duration > 200) {
        statusColor = 'text-yellow-400';
        statusBg = 'bg-yellow-500/10';
        statusLabel = 'Moderate';
        statusIcon = <Clock size={16} />;
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Database size={20} className="text-blue-400" />
                                Query Details
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-6 space-y-6">
                            {/* Metrics Bar */}
                            <div className={`${statusBg} rounded-xl p-4 border border-slate-700`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`${statusColor}`}>
                                            {statusIcon}
                                        </div>
                                        <div>
                                            <div className={`font-bold text-2xl ${statusColor}`}>
                                                {metrics.duration.toFixed(0)}ms
                                            </div>
                                            <div className="text-slate-400 text-sm">
                                                Execution Time • {statusLabel}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-xl text-white">
                                            {metrics.rowCount.toLocaleString()}
                                        </div>
                                        <div className="text-slate-400 text-sm">
                                            Rows Returned
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SQL Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                    Generated SQL
                                </h3>
                                <div className="rounded-xl overflow-hidden border border-slate-700">
                                    <SyntaxHighlighter
                                        language="sql"
                                        style={vscDarkPlus}
                                        customStyle={{
                                            margin: 0,
                                            padding: '16px',
                                            background: '#0f172a',
                                            fontSize: '13px',
                                            lineHeight: '1.6'
                                        }}
                                        wrapLines
                                        wrapLongLines
                                    >
                                        {sql || '-- No SQL generated'}
                                    </SyntaxHighlighter>
                                </div>
                            </div>

                            {/* AI Explanation Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Sparkles size={14} className="text-purple-400" />
                                    AI Analysis
                                </h3>
                                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                                    <div className="text-slate-500 text-sm italic mb-4">
                                        Click below to generate an AI explanation of this query's performance characteristics.
                                    </div>
                                    <button
                                        className="w-full py-2.5 px-4 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg border border-purple-500/30 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                                    >
                                        <Sparkles size={16} />
                                        Generate Explanation
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                            <button
                                onClick={() => {
                                    if (onTune) onTune();
                                    onClose();
                                }}
                                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-semibold shadow-lg shadow-blue-900/30"
                            >
                                <Wrench size={18} />
                                Tune & Fix
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default PerformanceDrawer;
