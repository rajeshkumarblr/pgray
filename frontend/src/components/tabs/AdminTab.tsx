import React, { useState, useEffect, useCallback } from 'react';
import { getServerSettings, getAdminDiagnostics, runAdminAction } from '../../api';
import {
    ShieldAlert, Activity, Zap, Sliders, RefreshCw, CheckCircle2,
    AlertTriangle, Play, Trash2, Search, Database, Lock, Sparkles
} from 'lucide-react';

interface AdminTabProps {
    connectionInfo: any;
    onOpenInWorkbench?: (sql: string, autoTune?: boolean) => void;
    onRefreshSchema?: () => void;
}

const KEY_TUNING_PARAMS = new Set([
    'shared_buffers',
    'work_mem',
    'maintenance_work_mem',
    'effective_cache_size',
    'random_page_cost',
    'seq_page_cost',
    'max_connections',
    'max_worker_processes',
    'max_parallel_workers_per_gather',
    'autovacuum',
    'wal_buffers',
    'checkpoint_completion_target',
]);

const AdminTab: React.FC<AdminTabProps> = ({ connectionInfo, onOpenInWorkbench, onRefreshSchema }) => {
    const [subTab, setSubTab] = useState<'health' | 'activity' | 'slow' | 'settings'>('health');
    const [diagnostics, setDiagnostics] = useState<any | null>(null);
    const [settings, setSettings] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState<string | null>(null);
    const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [settingsSearch, setSettingsSearch] = useState('');
    const [showKeyParamsOnly, setShowKeyParamsOnly] = useState(true);

    const fetchAll = useCallback(async () => {
        if (!connectionInfo) return;
        setLoading(true);
        try {
            const [diagRes, settingsRes] = await Promise.all([
                getAdminDiagnostics(connectionInfo).catch(() => null),
                getServerSettings(connectionInfo).catch(() => null),
            ]);
            if (diagRes?.data) setDiagnostics(diagRes.data);
            if (settingsRes?.data) setSettings(settingsRes.data);
        } finally {
            setLoading(false);
        }
    }, [connectionInfo]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const handleAction = async (key: string, action: string, target: string = '', sqlCommand: string = '') => {
        if (!connectionInfo || actionBusy) return;
        setActionBusy(key);
        setBannerMsg(null);
        try {
            const res = await runAdminAction(connectionInfo, action, target, sqlCommand);
            setBannerMsg({ type: 'success', text: res.message || 'Action completed successfully.' });
            await fetchAll();
            if (action === 'create_index' && onRefreshSchema) {
                onRefreshSchema();
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Action failed';
            setBannerMsg({ type: 'error', text: String(detail) });
        } finally {
            setActionBusy(null);
        }
    };

    const missingFkList = diagnostics?.missing_fk_indexes || [];
    const unusedIdxList = diagnostics?.unused_indexes || [];
    const tableStats = diagnostics?.table_stats || [];
    const activeSessions = diagnostics?.active_sessions || [];
    const slowQueries = diagnostics?.slow_queries || [];
    const pgStatEnabled = !!diagnostics?.pg_stat_statements_enabled;

    const filteredSettings = settings.filter(s => {
        if (showKeyParamsOnly && !KEY_TUNING_PARAMS.has(s.name)) return false;
        if (!settingsSearch.trim()) return true;
        const q = settingsSearch.toLowerCase();
        return (
            s.name?.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q) ||
            s.short_desc?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
            {/* Top Cockpit Header */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900/90 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                        <Database size={16} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100 m-0">PostgreSQL DBA & Performance Cockpit</h2>
                        <div className="text-[11px] text-slate-400">
                            Live diagnostics for <span className="font-mono text-slate-300">{connectionInfo?.database}</span> ({connectionInfo?.host}:{connectionInfo?.port})
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Sub-tab Navigation Pills */}
                    <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 mr-2">
                        <button
                            onClick={() => setSubTab('health')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                subTab === 'health' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <ShieldAlert size={13} />
                            <span>Index & Table Health</span>
                            {missingFkList.length > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-400/30">
                                    {missingFkList.length}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setSubTab('activity')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                subTab === 'activity' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Activity size={13} />
                            <span>Locks & Activity ({activeSessions.length})</span>
                        </button>

                        <button
                            onClick={() => setSubTab('slow')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                subTab === 'slow' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Zap size={13} />
                            <span>Query Hotspots</span>
                        </button>

                        <button
                            onClick={() => setSubTab('settings')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                subTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Sliders size={13} />
                            <span>pg_settings ({settings.length})</span>
                        </button>
                    </div>

                    <button
                        onClick={fetchAll}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin text-blue-400' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Status Banner */}
            {bannerMsg && (
                <div
                    className={`px-6 py-2 text-xs flex items-center justify-between border-b ${
                        bannerMsg.type === 'success'
                            ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                            : 'bg-red-950/60 border-red-800/60 text-red-300'
                    }`}
                >
                    <span>{bannerMsg.text}</span>
                    <button onClick={() => setBannerMsg(null)} className="text-slate-400 hover:text-white">✕</button>
                </div>
            )}

            {/* Main Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {subTab === 'health' && (
                    <>
                        {/* KPI Summary Row */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                <div className="text-xs text-slate-400 mb-1">Missing Foreign Key Indexes</div>
                                <div className="flex items-baseline justify-between">
                                    <span className={`text-2xl font-bold font-mono ${missingFkList.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {missingFkList.length}
                                    </span>
                                    <span className="text-[11px] text-slate-500">Unindexed FK columns cause slow JOINs & cascading locks</span>
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                <div className="text-xs text-slate-400 mb-1">Tables Tracked in Schema</div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-bold font-mono text-blue-400">
                                        {tableStats.length}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                        {tableStats.filter((t: any) => t.seq_scan > t.idx_scan && t.n_live_tup > 100).length} tables favor Seq Scans
                                    </span>
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                <div className="text-xs text-slate-400 mb-1">Unused Non-Unique Indexes</div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-bold font-mono text-purple-400">
                                        {unusedIdxList.length}
                                    </span>
                                    <span className="text-[11px] text-slate-500">idx_scan = 0 since last stats reset</span>
                                </div>
                            </div>
                        </div>

                        {/* 1. Missing FK Indexes Advisor */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={15} className="text-amber-400" />
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
                                        Missing Foreign Key Indexes ({missingFkList.length})
                                    </h3>
                                </div>
                                <span className="text-[11px] text-slate-400">
                                    PostgreSQL automatically indexes PRIMARY KEYs, but NOT FOREIGN KEY columns.
                                </span>
                            </div>

                            {missingFkList.length === 0 ? (
                                <div className="p-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                                    <CheckCircle2 size={15} />
                                    <span>All foreign key columns in this schema have supporting indexes!</span>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/70">
                                    {missingFkList.map((fk: any) => {
                                        const busyKey = `fk_${fk.table_name}_${fk.column_name}`;
                                        return (
                                            <div key={busyKey} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-slate-800/30">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                                                        <span className="font-mono text-amber-300">{fk.table_name}.{fk.column_name}</span>
                                                        <span className="text-slate-500">→</span>
                                                        <span className="font-mono text-blue-300">{fk.foreign_table}</span>
                                                        <span className="text-[11px] text-slate-500">({fk.est_rows.toLocaleString()} est rows)</span>
                                                    </div>
                                                    <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                                                        {fk.suggested_sql}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(fk.suggested_sql)}
                                                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                                                    >
                                                        Copy DDL
                                                    </button>
                                                    <button
                                                        disabled={actionBusy === busyKey}
                                                        onClick={() => handleAction(busyKey, 'create_index', fk.table_name, fk.suggested_sql)}
                                                        className="px-3 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold"
                                                    >
                                                        {actionBusy === busyKey ? 'Creating...' : '✅ Create Index'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 2. Table Access Patterns & Dead Tuple Bloat */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
                                    Table Scan Hotspots & Dead Tuple Bloat (pg_stat_user_tables)
                                </h3>
                                <span className="text-[11px] text-slate-400">
                                    Run ANALYZE to refresh planner histograms or VACUUM ANALYZE to reclaim dead tuples
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/40">
                                            <th className="py-2.5 px-4">Table</th>
                                            <th className="py-2.5 px-3 text-right">Size</th>
                                            <th className="py-2.5 px-3 text-right">Live Rows</th>
                                            <th className="py-2.5 px-3 text-right">Dead Tuple Bloat</th>
                                            <th className="py-2.5 px-3 text-right">Seq Scans (Rows Read)</th>
                                            <th className="py-2.5 px-3 text-right">Index Scans</th>
                                            <th className="py-2.5 px-4 text-right">Maintenance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-mono">
                                        {tableStats.map((t: any) => {
                                            const highBloat = t.dead_tup_pct >= 10;
                                            const highSeq = t.seq_scan > t.idx_scan && t.seq_tup_read > 500;
                                            return (
                                                <tr key={t.table_name} className="hover:bg-slate-800/30">
                                                    <td className="py-2.5 px-4 font-semibold text-slate-200">
                                                        <div className="flex items-center gap-2">
                                                            <span>{t.table_name}</span>
                                                            {highSeq && (
                                                                <span className="px-1.5 py-0.5 text-[9px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-sans">
                                                                    Seq Heavy
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-slate-400">{t.total_size}</td>
                                                    <td className="py-2.5 px-3 text-right text-slate-300">{t.n_live_tup.toLocaleString()}</td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <span className={highBloat ? 'text-red-400 font-bold' : 'text-slate-400'}>
                                                            {t.n_dead_tup.toLocaleString()} ({t.dead_tup_pct}%)
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <span className={highSeq ? 'text-amber-300' : 'text-slate-300'}>
                                                            {t.seq_scan.toLocaleString()}
                                                        </span>{' '}
                                                        <span className="text-slate-500 text-[10px]">({t.seq_tup_read.toLocaleString()})</span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-emerald-400">{t.idx_scan.toLocaleString()}</td>
                                                    <td className="py-2.5 px-4 text-right font-sans">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                disabled={!!actionBusy}
                                                                onClick={() => handleAction(`an_${t.table_name}`, 'analyze', t.table_name)}
                                                                className="px-2 py-1 rounded text-[10px] bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30"
                                                            >
                                                                ANALYZE
                                                            </button>
                                                            <button
                                                                disabled={!!actionBusy}
                                                                onClick={() => handleAction(`vac_${t.table_name}`, 'vacuum_analyze', t.table_name)}
                                                                className="px-2 py-1 rounded text-[10px] bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30"
                                                            >
                                                                VACUUM
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {subTab === 'activity' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Lock size={14} className="text-blue-400" />
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
                                    Live Sessions & Lock Tree (pg_stat_activity)
                                </h3>
                            </div>
                            <span className="text-[11px] text-slate-400">
                                Inspect active queries, idle-in-transaction sessions, and blocking PIDs
                            </span>
                        </div>

                        {activeSessions.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                                No other active or idle sessions connected to <span className="font-mono text-slate-300">{connectionInfo?.database}</span>.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/70">
                                {activeSessions.map((sess: any) => {
                                    const isBlocked = sess.blocking_pids && sess.blocking_pids.length > 0;
                                    return (
                                        <div key={sess.pid} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-800/30">
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap text-xs">
                                                    <span className="font-mono font-bold text-slate-200 bg-slate-800 px-2 py-0.5 rounded">
                                                        PID {sess.pid}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                        sess.state === 'active'
                                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                            : sess.state.includes('idle in transaction')
                                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                            : 'bg-slate-800 text-slate-400'
                                                    }`}>
                                                        {sess.state}
                                                    </span>
                                                    <span className="text-slate-400 font-mono text-[11px]">
                                                        {sess.usename}@{sess.client_addr} ({sess.application_name || 'psql'})
                                                    </span>
                                                    <span className="text-slate-400 font-mono text-[11px]">
                                                        • {sess.duration_sec}s
                                                    </span>
                                                    {isBlocked && (
                                                        <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                                                            🔒 Blocked by PID {sess.blocking_pids.join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                                {sess.query && (
                                                    <pre className="m-0 mt-1.5 p-2 rounded bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-blue-200 overflow-x-auto whitespace-pre-wrap">
                                                        {sess.query}
                                                    </pre>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {sess.query && onOpenInWorkbench && (
                                                    <button
                                                        onClick={() => onOpenInWorkbench(sess.query, false)}
                                                        className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px]"
                                                    >
                                                        Open in Workbench
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleAction(`kill_${sess.pid}`, 'cancel_backend', String(sess.pid))}
                                                    className="px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-[11px] flex items-center gap-1"
                                                    title="Cancel running query (pg_cancel_backend)"
                                                >
                                                    <Trash2 size={11} /> Cancel
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {subTab === 'slow' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Zap size={14} className="text-amber-400" />
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 m-0">
                                    Query Performance Hotspots (pg_stat_statements)
                                </h3>
                            </div>
                            {!pgStatEnabled && (
                                <button
                                    onClick={() => handleAction('enable_pgss', 'enable_pg_stat_statements')}
                                    className="px-3 py-1 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-medium"
                                >
                                    Enable pg_stat_statements
                                </button>
                            )}
                        </div>

                        {!pgStatEnabled ? (
                            <div className="p-8 text-center space-y-2">
                                <AlertTriangle size={22} className="text-amber-400 mx-auto" />
                                <div className="text-sm font-medium text-slate-200">pg_stat_statements is not enabled in this database</div>
                                <div className="text-xs text-slate-400 max-w-md mx-auto">
                                    Enable <code className="text-blue-300">pg_stat_statements</code> to track historical slow queries, execution counts, and buffer hit rates, then click any slow query to visually tune it in the Workbench.
                                </div>
                            </div>
                        ) : slowQueries.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                                No queries recorded in pg_stat_statements yet.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/70">
                                {slowQueries.map((sq: any, idx: number) => (
                                    <div key={idx} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-800/30">
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-center gap-3 text-xs font-mono">
                                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                                                    Mean: {sq.mean_ms} ms
                                                </span>
                                                <span className="text-slate-300">Total: <strong>{sq.total_ms} ms</strong></span>
                                                <span className="text-slate-400">Calls: <strong>{sq.calls}</strong></span>
                                                <span className="text-slate-400">Rows: <strong>{sq.rows}</strong></span>
                                            </div>
                                            <pre className="m-0 p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap">
                                                {sq.query}
                                            </pre>
                                        </div>
                                        {onOpenInWorkbench && (
                                            <button
                                                onClick={() => onOpenInWorkbench(sq.query, true)}
                                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
                                            >
                                                <Play size={11} fill="currentColor" />
                                                <span>Tune in Workbench</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {subTab === 'settings' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
                            <div className="flex items-center gap-2 flex-1">
                                <Search size={14} className="text-slate-400" />
                                <input
                                    type="text"
                                    value={settingsSearch}
                                    onChange={e => setSettingsSearch(e.target.value)}
                                    placeholder="Search PostgreSQL parameters (e.g., work_mem, shared_buffers, parallel, autovacuum)..."
                                    className="bg-transparent border-none outline-none text-xs text-slate-200 w-full"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showKeyParamsOnly}
                                    onChange={e => setShowKeyParamsOnly(e.target.checked)}
                                />
                                <span>Key Performance Parameters Only</span>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredSettings.map((setting) => (
                                <div key={setting.name} className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-mono font-semibold text-xs text-blue-400">{setting.name}</span>
                                            <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded">
                                                {setting.setting}{setting.unit ? ` ${setting.unit}` : ''}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-slate-400 leading-relaxed">{setting.short_desc}</div>
                                    </div>
                                    <div className="text-[10px] text-slate-600 mt-2 pt-1.5 border-t border-slate-800/60 truncate">
                                        {setting.category}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTab;


