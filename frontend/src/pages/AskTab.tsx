
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BarChart2, Database, Code, Activity, ArrowRight, Copy, Edit, History } from 'lucide-react';
import ChartViz from '../components/ChartViz';
import ResultsTable from '../components/ResultsTable';
import PerformanceDrawer from '../components/PerformanceDrawer';
import AskChat from '../components/AskChat';
import { generateSql, executeQuery, fixSql, getAskHistory, saveAskSuccess } from '../api'; // Import API functions
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Add to interface
interface AskTabProps {
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
    // Smart Dropdown Props
    savedQueries?: any[];
    recentSearches?: string[];
    onSelectQuery?: (query: any) => void;
    // Explanation Feature
    sqlExplanation?: string | null;
    onExplainLogic?: () => void;
    onTune?: () => void;
    onEditSql?: (sql?: string) => void;
    connectionInfo: any;
    model?: string;
}

const AskTab: React.FC<AskTabProps> = ({
    onSearch,
    isExecuting: propIsExecuting,
    result: propResult,
    error: propError,
    generatedSql: propGeneratedSql,
    // onExplain, 
    // explainResult,
    onReset,
    promptValue,
    onPromptChange,
    showResults,
    onShowResults,
    requiredParams = [],
    onRunParameterized,
    savedQueries = [],
    recentSearches = [],
    onSelectQuery,
    sqlExplanation,
    onExplainLogic,
    onTune,
    onEditSql,
    connectionInfo,
    model
}) => {
    // Lifted State
    const [activeTab, setActiveTab] = useState<'data' | 'charts' | 'sql'>('data');
    const [localParamValues, setLocalParamValues] = useState<Record<string, string>>({});
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // Fetch History on Mount/Connection Change
    React.useEffect(() => {
        if (connectionInfo) {
            getAskHistory(connectionInfo).then((asks: string[]) => {
                if (asks && asks.length > 0) {
                    setSuggestions(asks);
                } else {
                    setSuggestions(['Top 5 customers', 'Revenue by year', 'Products out of stock']);
                }
            });
        }
    }, [connectionInfo]);


    // Local State for Frontend-Driven Execution
    const [localResult, setLocalResult] = useState<any>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [localIsExecuting, setLocalIsExecuting] = useState(false);
    const [localGeneratedSql, setLocalGeneratedSql] = useState<string>("");
    // Helper to transform result from API format to UI format
    const transformResult = (execRes: any) => ({
        rows: execRes.data?.map((r: any) => {
            if (Array.isArray(r)) {
                const arr = [...r];
                (arr as any)._id = crypto.randomUUID();
                return arr;
            }
            return { ...r, _id: crypto.randomUUID() };
        }) || [],
        columns: execRes.meta?.columns || [],
        rowCount: execRes.meta?.row_count || 0,
        executionTime: execRes.meta?.duration_ms || 0
    });

    const executeSearch = async (term: string) => {
        if (!term.trim()) return;

        // Use Local Execution Logic
        setLocalIsExecuting(true);
        setLocalError(null);
        setLocalResult(null);
        setLocalGeneratedSql("");
        setActiveTab('data');

        try {
            // 1. Generate SQL
            const res = await generateSql(term, null, [], model || 'qwen2.5-coder', connectionInfo);
            let sql = res.sql || "";
            if (!sql && res.response) {
                const match = res.response.match(/```sql\n([\s\S]*?)\n```/);
                sql = match ? match[1] : res.response;
            }

            if (!sql) throw new Error("Failed to generate SQL");

            // Clean SQL
            sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();
            setLocalGeneratedSql(sql);

            // 2. Execute
            try {
                const execRes = await executeQuery(connectionInfo, sql, 50);
                setLocalResult(transformResult(execRes));
                // SUCCESS! Save history
                saveAskSuccess(connectionInfo, term, sql);
            } catch (execErr: any) {
                // Enhanced Error Extraction
                let originalError = execErr.message || "Unknown error";
                if (execErr.response && execErr.response.data) {
                    originalError = execErr.response.data.detail || JSON.stringify(execErr.response.data);
                }

                console.warn("SQL Execution Failed:", originalError, execErr);

                // 3. CATCH & REPAIR logic
                // Expanded keywords: "does not exist", "syntax", "undefined", "relation", "alias"
                const isFixable = originalError.match(/(does not exist|syntax|undefined|relation|alias|column)/i);

                if (isFixable || originalError.includes("42703") || originalError.includes("42P01")) { // Postgres codes
                    const fixMsg = `AI is fixing query... (${originalError.substring(0, 50)}...)`;
                    setLocalError(fixMsg);
                    console.log("Triggering Auto-Fix for:", originalError);

                    try {
                        const fixedRes = await fixSql(sql, originalError, connectionInfo, null, model || 'qwen2.5-coder');

                        if (fixedRes && fixedRes.fixed_sql) {
                            const fixedSql = fixedRes.fixed_sql;
                            console.log("SQL Auto-Corrected:", fixedSql);
                            setLocalGeneratedSql(fixedSql);

                            // 4. Retry Execution
                            const retryRes = await executeQuery(connectionInfo, fixedSql, 50);
                            setLocalResult(transformResult(retryRes));
                            setLocalError(null);
                            // RETRY SUCCESS! Save history
                            saveAskSuccess(connectionInfo, term, fixedSql);
                        } else {
                            console.error("Auto-Fix returned empty SQL");
                            throw new Error("AI could not fix the query");
                        }
                    } catch (fixErr: any) {
                        console.error("Auto-fix failed:", fixErr);
                        // Show actual fix failure if possible, or fallback to original
                        const fixFailMsg = fixErr.response?.data?.detail || fixErr.message;
                        setLocalError(`Auto-fix failed: ${fixFailMsg} | Original: ${originalError}`);
                    }
                } else {
                    setLocalError(originalError); // Show detailed error
                }
            }

        } catch (e: any) {
            console.error("Search Execution Error:", e);
            let msg = e.message || "Search failed";
            if (e.code === 'ECONNABORTED') {
                msg = "Request timed out (Network issue)";
            }
            if (e.response?.data?.detail) {
                msg = e.response.data.detail;
            }
            setLocalError(msg);
        } finally {
            setLocalIsExecuting(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!promptValue.trim()) return;
        onShowResults(true);
        // Use Local Logic instead of Parent
        executeSearch(promptValue);
        // onSearch(promptValue); // Disabled parent call
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
    // ...
    // Dropdown State
    const [isFocused, setIsFocused] = useState(false);

    // Effective State (Shadowing props)
    // Placed here to ensure local hooks are initialized
    const result = localResult || propResult;
    const error = localError || propError;
    const isExecuting = localIsExecuting || propIsExecuting;
    const generatedSql = localGeneratedSql || propGeneratedSql;

    // Derived: Show dropdown if focused and NOT showing results (Search Home)
    const showDropdown = isFocused && !showResults && ((recentSearches && recentSearches.length > 0) || (savedQueries && savedQueries.length > 0));

    // Auto-Explain Effect (Stabilized)
    const explainRef = React.useRef(onExplainLogic);
    React.useEffect(() => { explainRef.current = onExplainLogic; }, [onExplainLogic]);

    React.useEffect(() => {
        if (showResults && generatedSql && !sqlExplanation && !isExecuting && !error) {
            const timer = setTimeout(() => {
                explainRef.current?.();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [showResults, generatedSql, sqlExplanation, isExecuting, error]); // Removed onExplainLogic dependency

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

                    {/* Suggestions / History */}
                    {!showResults && (
                        <div className="flex flex-wrap gap-2 justify-center mt-4 max-w-2xl px-4">
                            {(suggestions.length > 0 ? suggestions : (recentSearches && recentSearches.length > 0 ? recentSearches.slice(0, 6) : ['Top 5 customers', 'Revenue by year', 'Products out of stock'])).map((s, i) => (
                                <button
                                    key={`sugg-${i}`}
                                    onClick={() => { onPromptChange(s); onShowResults(true); onSearch(s); }}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 rounded-full text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    {(suggestions.includes(s) || (recentSearches && recentSearches.includes(s))) && <History size={12} className="text-blue-400" />}
                                    <span>{s}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Results or Parameter Form Area - 3-Tab Architecture */}
            <AnimatePresence>
                {showResults && (result || error || isExecuting) && (
                    <motion.div
                        className="flex-1 w-full px-6 pb-6 overflow-hidden flex flex-col"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                    >
                        {/* TAB BAR */}
                        <div className="flex items-center gap-4 mb-2 border-b border-slate-800 px-2">
                            {[
                                { id: 'data', label: 'Data', icon: Database },
                                { id: 'charts', label: 'Charts', icon: BarChart2 },
                                { id: 'sql', label: 'SQL', icon: Code },
                            ].map(tab => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-all ${isActive
                                            ? 'border-blue-500 text-blue-400 bg-slate-900/50 rounded-t-lg'
                                            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30 rounded-t-lg'
                                            }`}
                                    >
                                        <Icon size={14} />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* CONTENT AREA */}
                        <div className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-b-xl rounded-tr-xl overflow-hidden shadow-xl relative">
                            {isExecuting ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-50">
                                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
                                    <p className="text-slate-400 animate-pulse font-medium">Running query...</p>
                                </div>
                            ) : (
                                <div className="h-full w-full overflow-hidden flex flex-col">
                                    {(error && activeTab !== 'sql') ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                            <Activity size={32} className="text-red-500 mb-4" />
                                            <h3 className="text-lg font-semibold text-slate-200">Search Failed</h3>
                                            <p className="text-slate-400 max-w-md mb-4">{error}</p>
                                            <button
                                                onClick={() => setActiveTab('sql')}
                                                className="text-blue-400 hover:text-blue-300 hover:underline text-sm flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg transition-colors border border-slate-700"
                                            >
                                                <Code size={14} /> View Generated SQL
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {activeTab === 'data' && (
                                                !result ? (
                                                    <div className="flex items-center justify-center h-full text-slate-500">Waiting for results...</div>
                                                ) : (
                                                    <div className="h-full w-full flex flex-col">
                                                        <div className="px-4 py-2 border-b border-slate-800 text-xs text-slate-400 flex justify-between bg-slate-900/80">
                                                            <span>{result.rowCount} results found</span>
                                                            {result.executionTime && <span>{result.executionTime}ms</span>}
                                                        </div>
                                                        <div className="flex-1 overflow-auto bg-slate-900">
                                                            <ResultsTable data={result} />
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                            {activeTab === 'charts' && (
                                                !result ? (
                                                    <div className="flex items-center justify-center h-full text-slate-500">Waiting for results...</div>
                                                ) : (
                                                    <div className="flex-1 w-full p-4 overflow-hidden bg-slate-900 flex flex-col min-h-0">
                                                        <div className="relative w-full h-full min-h-[400px]">
                                                            <ChartViz data={result.rows} columns={result.columns} />
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                            {activeTab === 'sql' && (
                                                <div className="flex w-full h-full flex-col">
                                                    {error && (
                                                        <div className="bg-red-500/10 border-b border-red-500/20 p-3 text-sm text-red-200 flex items-center gap-2">
                                                            <Activity size={14} className="text-red-400" />
                                                            {error}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 flex overflow-hidden">

                                                        {/* LEFT PANE (75%) */}
                                                        <div className="flex-[3] flex flex-col min-w-0 border-r border-slate-800 bg-slate-900">
                                                            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                                                                <span className="text-xs text-slate-400 font-mono flex items-center gap-2">
                                                                    <Code size={12} /> GENERATED SQL
                                                                </span>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => navigator.clipboard.writeText(generatedSql || '')}
                                                                        className="p-1 text-slate-400 hover:text-white transition-colors"
                                                                        title="Copy SQL"
                                                                    >
                                                                        <Copy size={14} />
                                                                    </button>
                                                                    {onEditSql && (
                                                                        <button
                                                                            onClick={() => onEditSql(generatedSql)}
                                                                            className="p-1 text-slate-400 hover:text-white transition-colors"
                                                                            title="Edit in Query Editor"
                                                                        >
                                                                            <Edit size={14} />
                                                                        </button>
                                                                    )}
                                                                    {onTune && (
                                                                        <button
                                                                            onClick={onTune}
                                                                            className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded transition-colors shadow"
                                                                        >
                                                                            <Activity size={10} /> Tune
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 overflow-auto custom-scrollbar">
                                                                <SyntaxHighlighter
                                                                    language="sql"
                                                                    style={vscDarkPlus}
                                                                    customStyle={{ margin: 0, height: '100%', background: 'transparent', padding: '1rem' }}
                                                                    wrapLongLines={true}
                                                                    showLineNumbers={true}
                                                                    lineNumberStyle={{
                                                                        userSelect: 'none',
                                                                        color: '#64748b',
                                                                        borderRight: '1px solid #334155',
                                                                        paddingRight: '1rem',
                                                                        marginRight: '1rem',
                                                                        textAlign: 'right',
                                                                        minWidth: '2em'
                                                                    }}
                                                                >
                                                                    {generatedSql || ''}
                                                                </SyntaxHighlighter>
                                                            </div>
                                                        </div>

                                                        {/* RIGHT PANE (25%) */}
                                                        <div className="flex-1 flex flex-col min-w-[250px] bg-slate-900">
                                                            <div className="flex-1 flex flex-col bg-slate-900 border-l border-slate-800 relative">
                                                                <AskChat
                                                                    connectionInfo={connectionInfo}
                                                                    sql={generatedSql || ''}
                                                                    initialExplanation={sqlExplanation}
                                                                    model={model}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>

            {/* Performance Drawer */}
            <PerformanceDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                sql={generatedSql || ''}
                metrics={{
                    duration: result?.executionTime || 0,
                    rowCount: result?.rowCount || 0
                }}
                onTune={onTune}
            />
        </div>
    );
};

export default AskTab;
