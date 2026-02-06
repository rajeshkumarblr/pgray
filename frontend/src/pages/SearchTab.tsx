
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BarChart2, Database, Code, Activity, ArrowRight } from 'lucide-react';
import ChartViz from '../components/ChartViz';
import ResultsTable from '../components/ResultsTable';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Add to interface
interface SearchTabProps {
    onSearch: (prompt: string) => void;
    isExecuting: boolean;
    result: any;
    error: string | null;
    generatedSql?: string;
    onExplain?: () => void;
    explainResult?: any;
    onReset?: () => void;
    // Controlled State Props
    promptValue: string;
    onPromptChange: (val: string) => void;
    showResults: boolean;
    onShowResults: (show: boolean) => void;
    // Parameters Support
    requiredParams?: any[];
    onRunParameterized?: (values: Record<string, string>) => void;
    // Smart Dropdown Props
    savedQueries?: any[];
    recentSearches?: string[];
    onSelectQuery?: (query: any) => void;
}

const SearchTab: React.FC<SearchTabProps> = ({
    onSearch,
    isExecuting,
    result,
    error,
    generatedSql,
    onExplain,
    explainResult,
    onReset,
    promptValue,
    onPromptChange,
    showResults,
    onShowResults,
    requiredParams = [],
    onRunParameterized,
    savedQueries = [],
    recentSearches = [],
    onSelectQuery
}) => {
    // Lifted State
    const [activeTab, setActiveTab] = useState<'data' | 'visuals' | 'sql' | 'analysis'>('data');
    const [localParamValues, setLocalParamValues] = useState<Record<string, string>>({});

    // Reset local params when requiredParams change
    React.useEffect(() => {
        setLocalParamValues({});
    }, [requiredParams]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!promptValue.trim()) return;
        onShowResults(true);
        onSearch(promptValue);
    };

    const handleBack = () => {
        onShowResults(false);
        onPromptChange('');
        if (onReset) onReset();
    };

    const handleParamRun = (e: React.FormEvent) => {
        e.preventDefault();
        if (onRunParameterized) {
            onRunParameterized(localParamValues);
        }
    };

    // Animation Variants
    const containerVariants = {
        centered: {
            paddingTop: '30vh',
            justifyContent: 'center',
        },
        top: {
            paddingTop: '2rem',
            justifyContent: 'flex-start',
        }
    };

    // Check if we are in "Parameter Collection Mode" (has params, showResults is true (activated), but no result yet? or explicit mode)
    // Actually, if we have requiredParams, and we are "showing results" (active), we should show the form FIRST.
    // We can interpret `showResults` as "Active Mode".
    // If `requiredParams.length > 0` and `!result` (or special flag?), show form.
    // Better: If `requiredParams.length > 0`, show form. 
    // Wait, if we run it, we get a result. 
    // Logic: If `requiredParams` exist AND we haven't successfully executed (no result or maybe explicit "awaiting params" state?), show form.
    // But `result` might be null if execution failed.
    // Let's assume if `requiredParams` is passed, we show the form UNLESS we are currently executing or have a valid result that matches?
    // Actually, `QueryWorkspace` controls this. If `QueryWorkspace` passes `requiredParams`, it means "I need these". 
    // Once executed, `QueryWorkspace` might clear `requiredParams` or we just switch view if `result` is there.
    // Let's rely on: If `requiredParams.length > 0` show the form.
    // When the user clicks Run, `QueryWorkspace` will execute.
    // Does `QueryWorkspace` clear `requiredParams` after execution? Probably not.
    // We need a way to see "Results" instead of "Form" after execution.
    // Maybe checking `result` is enough. 

    // Dropdown State
    const [isFocused, setIsFocused] = useState(false);

    // Derived: Show dropdown if focused and NOT showing results (Search Home)
    const showDropdown = isFocused && !showResults && ((recentSearches && recentSearches.length > 0) || (savedQueries && savedQueries.length > 0));

    // Restore lost definition
    const showParamForm = showResults && requiredParams.length > 0 && !result && !isExecuting && !error;

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 overflow-hidden relative" onClick={() => setIsFocused(false)}>

            {/* Back Button - Returns to Search Home */}
            {showResults && (
                <button
                    onClick={handleBack}
                    className="absolute top-4 left-4 z-50 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    title="Back to Search"
                >
                    <ArrowRight className="rotate-180" size={24} />
                </button>
            )}

            {/* Search Header Area */}
            <motion.div
                className="flex flex-col items-center px-4 z-10 w-full"
                initial="centered"
                animate={showResults ? "top" : "centered"}
                variants={containerVariants}
                transition={{ duration: 0.5, ease: "easeInOut" }}
            >
                <div className="w-full max-w-3xl flex flex-col gap-4 relative" onClick={(e) => e.stopPropagation()}>
                    <h1
                        className={`text-center font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent transition-all duration-500 ${showResults ? 'text-2xl mb-2' : 'text-5xl mb-8'}`}
                    >
                        {showResults ? (showParamForm ? "Configure Parameters" : "PGray Search") : "Ask your data"}
                    </h1>

                    <div className="relative w-full group">
                        <form onSubmit={handleSubmit} className="relative w-full">
                            <div className={`absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors ${showResults ? 'text-slate-400' : 'text-slate-500'}`}>
                                <Search size={20} />
                            </div>
                            <input
                                type="text"
                                className={`w-full bg-slate-900/80 border ${isFocused ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-700'} hover:border-blue-500 rounded-2xl py-4 pl-12 pr-12 text-lg shadow-xl outline-none transition-all placeholder:text-slate-600`}
                                placeholder="Show me top 5 movies by revenue..."
                                value={promptValue}
                                onChange={(e) => onPromptChange(e.target.value)}
                                onFocus={() => setIsFocused(true)}
                                disabled={isExecuting}
                            />
                            <button
                                type="submit"
                                disabled={!promptValue.trim() || isExecuting}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-50 disabled:bg-slate-700 transition-all shadow-lg shadow-blue-900/20"
                            >
                                {isExecuting ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <ArrowRight size={20} />
                                )}
                            </button>
                        </form>

                        {/* Smart Dropdown */}
                        <AnimatePresence>
                            {showDropdown && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
                                >
                                    {/* Recents Section */}
                                    {recentSearches && recentSearches.length > 0 && (
                                        <div className="p-2 border-b border-slate-800">
                                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">Recent</div>
                                            {recentSearches.map((q, i) => (
                                                <button
                                                    key={i}
                                                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                                                    onClick={() => {
                                                        if (onSelectQuery) onSelectQuery(q);
                                                        setIsFocused(false);
                                                    }}
                                                >
                                                    <Activity size={16} className="text-slate-500" />
                                                    <span className="truncate">{q}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Saved Section */}
                                    {savedQueries && savedQueries.length > 0 && (
                                        <div className="p-2">
                                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">Saved Queries</div>
                                            {savedQueries.map((q, i) => (
                                                <button
                                                    key={i}
                                                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                                                    onClick={() => {
                                                        if (onSelectQuery) onSelectQuery(q);
                                                        setIsFocused(false);
                                                    }}
                                                >
                                                    <div className="text-yellow-500">
                                                        <Database size={16} />
                                                    </div>
                                                    <span className="truncate font-medium">{q.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Inline Parameter Form */}
                    <AnimatePresence>
                        {showParamForm && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="w-full"
                            >
                                <form onSubmit={handleParamRun} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 flex flex-wrap gap-4 items-end shadow-lg backdrop-blur-sm">
                                    {requiredParams.map((p, idx) => {
                                        const pName = typeof p === 'string' ? p : p.name;
                                        return (
                                            <div key={idx} className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                                                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider pl-1">{pName}</label>
                                                <input
                                                    type="text"
                                                    autoFocus={idx === 0}
                                                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                                    placeholder={`Enter value...`}
                                                    value={localParamValues[pName] || ''}
                                                    onChange={e => setLocalParamValues({ ...localParamValues, [pName]: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') handleBack();
                                                    }}
                                                />
                                            </div>
                                        )
                                    })}
                                    <button
                                        type="submit"
                                        className="h-[38px] px-6 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-blue-900/30 transition-all active:scale-[0.98]"
                                        title="Run Query (Enter)"
                                    >
                                        Run
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Suggestions (Only on Initial) */}
                    {!showResults && (
                        <div className="flex flex-wrap gap-2 justify-center mt-4">
                            {['Top 5 customers', 'Revenue by year', 'Products out of stock'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => { onPromptChange(s); onShowResults(true); onSearch(s); }}
                                    className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 rounded-full text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Results or Parameter Form Area */}
            <AnimatePresence>
                {showResults && (result || error || isExecuting) && (
                    <motion.div
                        className="flex-1 w-full px-6 pb-6 overflow-hidden flex flex-col"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                    >
                        <div className="flex flex-col h-full overflow-hidden">

                            {/* Tabs Header */}
                            <div className="flex items-center gap-1 mb-4 border-b border-slate-800 pb-1">
                                {[
                                    { id: 'data', label: 'Data', icon: Database },
                                    { id: 'visuals', label: 'Visuals', icon: BarChart2 },
                                    { id: 'sql', label: 'SQL', icon: Code },
                                    { id: 'analysis', label: 'Analysis', icon: Activity },
                                ].map(tab => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as any)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-all ${isActive ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                                        >
                                            <Icon size={16} />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                                <div className="flex-1" />
                                <button className="px-3 py-1.5 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors">
                                    Export
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
                                {isExecuting ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50">
                                        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
                                        <p className="text-slate-400 animate-pulse">Thinking...</p>
                                    </div>
                                ) : error ? (
                                    <div className="p-10 text-center">
                                        <div className="text-red-400 text-lg mb-2">Search Failed</div>
                                        <p className="text-slate-500">{error}</p>
                                    </div>
                                ) : !result ? (
                                    <div className="p-10 text-center text-slate-500">
                                        Ready to explore.
                                    </div>
                                ) : (
                                    <div className="h-full w-full overflow-auto">
                                        {activeTab === 'data' && (
                                            <div className="h-full">
                                                <ResultsTable
                                                    data={result}
                                                />
                                            </div>
                                        )}
                                        {activeTab === 'visuals' && (
                                            <div className="h-full p-6">
                                                <ChartViz data={result.rows} columns={result.columns} />
                                            </div>
                                        )}
                                        {activeTab === 'sql' && (
                                            <div className="h-full p-4 overflow-auto">
                                                <SyntaxHighlighter language="sql" style={vscDarkPlus} customStyle={{ background: 'transparent', margin: 0 }}>
                                                    {generatedSql || "-- No SQL generated"}
                                                </SyntaxHighlighter>
                                            </div>
                                        )}
                                        {activeTab === 'analysis' && (
                                            <div className="h-full flex items-center justify-center text-slate-500">
                                                {explainResult ? (
                                                    <pre className="text-xs text-left p-4 overflow-auto max-h-full">
                                                        {JSON.stringify(explainResult, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <button
                                                        onClick={onExplain}
                                                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-xl transition-all"
                                                    >
                                                        Run Analysis
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SearchTab;
