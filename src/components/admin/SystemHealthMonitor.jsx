import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Activity,
    Server,
    Database,
    Shield,
    Brain,
    Globe,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    HelpCircle,
    RefreshCw,
    Clock,
    Zap,
    AlertOctagon,
    Sliders,
    Layers,
} from "lucide-react";
import toast from "react-hot-toast";
import {
    fetchSystemHealth,
    fetchSystemMetrics,
    fetchSystemIncidents,
} from "../../services/adminService";

export default function SystemHealthMonitor() {
    const [healthData, setHealthData] = useState(null);
    const [metricsData, setMetricsData] = useState(null);
    const [incidentsData, setIncidentsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [severityFilter, setSeverityFilter] = useState("all");
    const [serviceFilter, setServiceFilter] = useState("all");

    const fetchMonitoringBundle = useCallback(async () => {
        const [health, metrics, incidentsRes] = await Promise.all([
            fetchSystemHealth(),
            fetchSystemMetrics(),
            fetchSystemIncidents({ severity: "all", limit: 50 }),
        ]);

        return {
            health,
            metrics,
            incidents: incidentsRes && incidentsRes.incidents ? incidentsRes.incidents : [],
        };
    }, []);

    // Initial mount effect - loads data with cancellation/stale-response guard
    useEffect(() => {
        let isCurrent = true;

        fetchMonitoringBundle()
            .then(({ health, metrics, incidents }) => {
                if (!isCurrent) return;
                if (health) setHealthData(health);
                if (metrics) setMetricsData(metrics);
                if (incidents) setIncidentsData(incidents);
            })
            .catch((err) => {
                if (!isCurrent) return;
                console.error("SystemHealthMonitor fetch error:", err);
                toast.error("Failed to refresh system monitoring data.");
            })
            .finally(() => {
                if (isCurrent) {
                    setLoading(false);
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [fetchMonitoringBundle]);

    // 30-second polling if autoRefresh is enabled
    useEffect(() => {
        if (!autoRefresh) return;
        let isCurrent = true;

        const interval = setInterval(() => {
            fetchMonitoringBundle()
                .then(({ health, metrics, incidents }) => {
                    if (!isCurrent) return;
                    if (health) setHealthData(health);
                    if (metrics) setMetricsData(metrics);
                    if (incidents) setIncidentsData(incidents);
                })
                .catch((err) => {
                    if (!isCurrent) return;
                    console.error("SystemHealthMonitor polling error:", err);
                });
        }, 30000);

        return () => {
            isCurrent = false;
            clearInterval(interval);
        };
    }, [autoRefresh, fetchMonitoringBundle]);

    const handleManualRefresh = async () => {
        setRefreshing(true);
        try {
            const { health, metrics, incidents } = await fetchMonitoringBundle();
            if (health) setHealthData(health);
            if (metrics) setMetricsData(metrics);
            if (incidents) setIncidentsData(incidents);
            toast.success("System status refreshed.");
        } catch (err) {
            console.error("SystemHealthMonitor fetch error:", err);
            toast.error("Failed to refresh system monitoring data.");
        } finally {
            setRefreshing(false);
        }
    };

    const overallStatus = healthData?.overallStatus || "unknown";
    const subsystems = healthData?.subsystems || {};

    // Filtered incidents
    const filteredIncidents = useMemo(() => {
        return incidentsData.filter((inc) => {
            if (severityFilter !== "all" && inc.severity !== severityFilter) return false;
            if (serviceFilter !== "all" && inc.service !== serviceFilter) return false;
            return true;
        });
    }, [incidentsData, severityFilter, serviceFilter]);

    // Subsystem helper
    const getStatusTheme = (status) => {
        switch (status) {
            case "operational":
                return {
                    color: "text-emerald-400",
                    bg: "bg-emerald-500/10",
                    border: "border-emerald-500/30",
                    badge: "bg-emerald-500/20 text-emerald-300",
                    icon: CheckCircle2,
                    label: "Operational",
                };
            case "degraded":
                return {
                    color: "text-amber-400",
                    bg: "bg-amber-500/10",
                    border: "border-amber-500/30",
                    badge: "bg-amber-500/20 text-amber-300",
                    icon: AlertTriangle,
                    label: "Degraded",
                };
            case "unavailable":
                return {
                    color: "text-rose-400",
                    bg: "bg-rose-500/10",
                    border: "border-rose-500/30",
                    badge: "bg-rose-500/20 text-rose-300",
                    icon: XCircle,
                    label: "Unavailable",
                };
            default:
                return {
                    color: "text-slate-400",
                    bg: "bg-slate-500/10",
                    border: "border-slate-500/30",
                    badge: "bg-slate-500/20 text-slate-300",
                    icon: HelpCircle,
                    label: "Unknown",
                };
        }
    };

    const overallTheme = getStatusTheme(overallStatus);

    if (loading && !healthData) {
        return (
            <div className="p-12 text-center rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-4">
                <RefreshCw size={36} className="animate-spin text-cyan-400 mx-auto" />
                <p className="text-sm font-semibold text-white">Running Subsystem Connectivity & Health Probes...</p>
                <p className="text-xs text-slate-400">Verifying Express API, Cloud Firestore, Firebase Auth, and Flask ML availability.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                System Health & Reliability Center
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${overallTheme.badge} border ${overallTheme.border}`}>
                                    {overallTheme.label}
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Live subsystem connectivity, API response telemetry, and platform incident audit.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Auto-Refresh Toggle */}
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            autoRefresh
                                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                                : "bg-white/5 border-white/10 text-slate-400"
                        }`}
                        title="Toggle 30-second live polling"
                    >
                        <Clock size={14} className={autoRefresh ? "animate-spin text-cyan-400" : ""} />
                        Auto-Refresh (30s): {autoRefresh ? "ON" : "OFF"}
                    </button>

                    {/* Manual Refresh Button */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-black font-bold text-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                        {refreshing ? "Checking..." : "Refresh Status"}
                    </button>
                </div>
            </div>

            {/* Subsystem Health Cards Grid (Part A) */}
            <div>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Layers size={16} className="text-cyan-400" />
                    Subsystem Connectivity & Service Status
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {/* Frontend */}
                    <SubsystemCard
                        title="Frontend Application"
                        sub="React 18 + Vite SPA"
                        icon={Globe}
                        data={subsystems.frontend}
                        theme={getStatusTheme(subsystems.frontend?.status)}
                    />

                    {/* Admin Backend */}
                    <SubsystemCard
                        title="Admin API Server"
                        sub={`Express (Port 3001) · Node ${subsystems.backend?.memory ? `${subsystems.backend.memory.heapUsedMb}MB heap` : ""}`}
                        icon={Server}
                        data={subsystems.backend}
                        theme={getStatusTheme(subsystems.backend?.status)}
                        extra={subsystems.backend?.uptimeSeconds !== undefined ? `Uptime: ${formatUptime(subsystems.backend.uptimeSeconds)}` : null}
                    />

                    {/* Cloud Firestore */}
                    <SubsystemCard
                        title="Cloud Firestore"
                        sub="Document Database & Rules"
                        icon={Database}
                        data={subsystems.firestore}
                        theme={getStatusTheme(subsystems.firestore?.status)}
                    />

                    {/* Firebase Auth */}
                    <SubsystemCard
                        title="Firebase Auth"
                        sub="User Directory & Tokens"
                        icon={Shield}
                        data={subsystems.firebaseAuth}
                        theme={getStatusTheme(subsystems.firebaseAuth?.status)}
                    />

                    {/* Flask ML Backend */}
                    <SubsystemCard
                        title="Flask ML Engine"
                        sub="AI Screening Model (/predict)"
                        icon={Brain}
                        data={subsystems.flaskMl}
                        theme={getStatusTheme(subsystems.flaskMl?.status)}
                        extra={subsystems.flaskMl?.endpoint ? truncateUrl(subsystems.flaskMl.endpoint) : null}
                    />
                </div>
            </div>

            {/* API Performance Telemetry (Part B) */}
            <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                    <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <Zap size={18} className="text-amber-400" />
                            API Performance & Reliability Telemetry
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Real-time metrics calculated from server request telemetry (bounded in-memory ring buffer).
                        </p>
                    </div>
                    {metricsData && (
                        <span className="text-xs text-slate-400 font-mono">
                            Server Uptime: {formatUptime(metricsData.uptimeSeconds)}
                        </span>
                    )}
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MetricCard
                        label="Total Requests"
                        value={metricsData?.totalRequests ?? 0}
                        sub="Since server restart"
                        color="text-white"
                    />
                    <MetricCard
                        label="Success Rate"
                        value={`${metricsData?.successRate ?? 100}%`}
                        sub={`${metricsData?.successfulRequests ?? 0} successful`}
                        color="text-emerald-400"
                    />
                    <MetricCard
                        label="Avg Response Time"
                        value={`${metricsData?.avgLatencyMs ?? 0}ms`}
                        sub="Mean server latency"
                        color="text-cyan-400"
                    />
                    <MetricCard
                        label="Client Errors (4xx)"
                        value={metricsData?.clientErrors ?? 0}
                        sub="Auth/Validation misses"
                        color="text-amber-400"
                    />
                    <MetricCard
                        label="Server Errors (5xx)"
                        value={metricsData?.serverErrors ?? 0}
                        sub="Internal exceptions"
                        color={metricsData?.serverErrors ? "text-rose-400" : "text-slate-400"}
                    />
                    <MetricCard
                        label="Slow Requests (>500ms)"
                        value={metricsData?.slowRequestsCount ?? 0}
                        sub="Latency spike alerts"
                        color={metricsData?.slowRequestsCount ? "text-amber-300" : "text-slate-400"}
                    />
                </div>

                {/* Endpoint Performance Table */}
                {metricsData?.endpoints && metricsData.endpoints.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Sliders size={14} className="text-purple-400" />
                            Endpoint Performance Breakdown
                        </h4>
                        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-white/10 bg-white/5 text-slate-400 font-semibold">
                                        <th className="py-2.5 px-4">Method & Path</th>
                                        <th className="py-2.5 px-4 text-center">Requests</th>
                                        <th className="py-2.5 px-4 text-center">Avg Latency</th>
                                        <th className="py-2.5 px-4 text-center">4xx Errors</th>
                                        <th className="py-2.5 px-4 text-center">5xx Errors</th>
                                        <th className="py-2.5 px-4 text-right">Last Invocation</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-slate-300 font-mono">
                                    {metricsData.endpoints.map((ep) => (
                                        <tr key={ep.endpoint} className="hover:bg-white/5 transition-colors">
                                            <td className="py-2 px-4 flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    ep.method === "POST" ? "bg-cyan-500/20 text-cyan-300" :
                                                    ep.method === "GET" ? "bg-purple-500/20 text-purple-300" : "bg-slate-500/20 text-slate-300"
                                                }`}>
                                                    {ep.method}
                                                </span>
                                                <span className="text-white font-sans truncate max-w-xs">{ep.path}</span>
                                            </td>
                                            <td className="py-2 px-4 text-center font-bold text-white">{ep.count}</td>
                                            <td className="py-2 px-4 text-center text-cyan-300">{ep.avgLatencyMs}ms</td>
                                            <td className="py-2 px-4 text-center text-amber-300">{ep.errors4xx}</td>
                                            <td className="py-2 px-4 text-center text-rose-400">{ep.errors5xx}</td>
                                            <td className="py-2 px-4 text-right text-slate-400 font-sans">
                                                {formatRelativeTime(ep.lastAccessed)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Error and Incident Monitoring Timeline (Part C) */}
            <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <AlertOctagon size={18} className="text-rose-400" />
                            Platform Incidents & Diagnostic Audit
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Automated incident stream recording timeout events, connection anomalies, and recovery signals.
                        </p>
                    </div>

                    {/* Filter controls */}
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            aria-label="Filter incidents by severity"
                            className="bg-slate-950/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                        >
                            <option value="all">All Severities</option>
                            <option value="critical">Critical</option>
                            <option value="error">Error</option>
                            <option value="warning">Warning</option>
                            <option value="info">Info</option>
                        </select>

                        <select
                            value={serviceFilter}
                            onChange={(e) => setServiceFilter(e.target.value)}
                            aria-label="Filter incidents by service"
                            className="bg-slate-950/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                        >
                            <option value="all">All Services</option>
                            <option value="admin-backend">Admin Backend</option>
                            <option value="firestore">Firestore</option>
                            <option value="firebase-auth">Firebase Auth</option>
                            <option value="flask-ml">Flask ML</option>
                        </select>
                    </div>
                </div>

                {filteredIncidents.length === 0 ? (
                    <div className="text-center py-8 rounded-2xl bg-white/5 border border-white/5">
                        <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2 opacity-80" />
                        <p className="text-sm font-semibold text-white">All Subsystems Clear</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                            No operational incidents matching current filters. All services are healthy without active errors.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {filteredIncidents.map((inc) => {
                            const isCrit = inc.severity === "critical" || inc.severity === "error";
                            const isWarn = inc.severity === "warning";
                            return (
                                <div
                                    key={inc.id}
                                    className={`p-4 rounded-2xl border transition-all ${
                                        isCrit
                                            ? "bg-rose-500/10 border-rose-500/30"
                                            : isWarn
                                            ? "bg-amber-500/10 border-amber-500/30"
                                            : "bg-slate-800/40 border-white/10"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                    isCrit
                                                        ? "bg-rose-500/20 text-rose-300"
                                                        : isWarn
                                                        ? "bg-amber-500/20 text-amber-300"
                                                        : "bg-cyan-500/20 text-cyan-300"
                                                }`}
                                            >
                                                {inc.severity}
                                            </span>
                                            <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] font-mono">
                                                {inc.service}
                                            </span>
                                            <span className="text-xs font-bold text-white">
                                                {inc.eventType}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-slate-400 shrink-0">
                                            {formatTimestamp(inc.timestamp)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 mt-2 font-mono break-words">
                                        {inc.message}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function SubsystemCard({ title, sub, icon: Icon, data, theme, extra }) {
    const latency = data?.latencyMs;

    return (
        <div className={`p-5 rounded-2xl border ${theme.border} ${theme.bg} backdrop-blur-md flex flex-col justify-between transition-all hover:scale-[1.01]`}>
            <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-white/10 border border-white/10 text-white">
                        <Icon size={18} />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${theme.badge}`}>
                        {theme.label}
                    </span>
                </div>

                <h4 className="text-sm font-bold text-white">{title}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>

                <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">
                    {data?.message || "Subsystem status verified."}
                </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono">
                    {latency !== null && latency !== undefined ? `${latency}ms latency` : "—"}
                </span>
                {extra ? (
                    <span className="text-slate-400 truncate max-w-[110px]" title={extra}>
                        {extra}
                    </span>
                ) : (
                    <span className="text-slate-500">
                        {data?.lastChecked ? formatRelativeTime(data.lastChecked) : ""}
                    </span>
                )}
            </div>
        </div>
    );
}

function MetricCard({ label, value, sub, color }) {
    return (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</span>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
        </div>
    );
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatUptime(seconds) {
    if (!seconds && seconds !== 0) return "—";
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatRelativeTime(epoch) {
    if (!epoch) return "";
    const diff = Math.floor((Date.now() - epoch) / 1000);
    if (diff < 10) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function formatTimestamp(epoch) {
    if (!epoch) return "";
    return new Date(epoch).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        month: "short",
        day: "numeric",
    });
}

function truncateUrl(url) {
    try {
        const u = new URL(url);
        return u.hostname;
    } catch {
        return url.slice(0, 20);
    }
}
