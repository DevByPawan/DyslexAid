import { useState } from "react";
import {
    BarChart3,
    TrendingUp,
    Users,
    Activity,
    Award,
    Calendar,
    CheckCircle2,
    Shield,
    Sparkles,
    FileCheck,
} from "lucide-react";

export default function AnalyticsVisualizer({
    analyticsData,
    loading,
    selectedRange,
    onRangeChange,
}) {
    const [trendView, setTrendView] = useState("registrations"); // 'registrations' | 'assessments' | 'activity'

    if (loading && !analyticsData) {
        return (
            <div className="py-20 text-center space-y-4">
                <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-400 text-sm">Aggregating live platform analytics...</p>
            </div>
        );
    }

    const data = analyticsData || {};
    const overview = data.overview || {};
    const roleDist = data.roleDistribution || {};
    const approvalDist = data.approvalDistribution || {};
    const accountDist = data.accountStatusDistribution || {};
    const assessmentStats = data.assessmentStats || {};
    const riskDist = assessmentStats.riskDistribution || {};
    const typeBreakdown = assessmentStats.typeBreakdown || {};

    // Pick active trend array
    let activeTrends = data.registrationTrends || [];
    if (trendView === "assessments") activeTrends = data.assessmentTrends || [];
    if (trendView === "activity") activeTrends = data.activityTrends || [];

    const maxTrendCount = Math.max(1, ...activeTrends.map((t) => t.count || 0));

    // Ranges list
    const ranges = [
        { id: "7d", label: "Last 7 Days" },
        { id: "30d", label: "Last 30 Days" },
        { id: "90d", label: "Last 90 Days" },
        { id: "all", label: "All Time" },
    ];

    return (
        <div className="space-y-8">
            {/* Top Toolbar: Date Filters & Privacy Notice */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <BarChart3 className="text-cyan-400" size={24} />
                        Platform Analytics & Insights
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                        Live server-aggregated metrics derived from authenticated registrations and assessments.
                    </p>
                </div>

                {/* Range Pills */}
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 shrink-0 self-start sm:self-auto">
                    {ranges.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => onRangeChange(r.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                selectedRange === r.id
                                    ? "bg-cyan-400 text-black shadow-md shadow-cyan-500/20"
                                    : "text-slate-400 hover:text-white"
                            }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Privacy Protection Callout */}
            <div className="p-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-slate-900 to-purple-500/10 flex items-start sm:items-center gap-3">
                <Shield size={20} className="text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs text-slate-300 flex-1">
                    <span className="font-semibold text-white">Strict Student Privacy Safeguards:</span> Individual student screening transcripts, voice recordings, and private learning logs are never exposed in platform aggregate analytics.
                </div>
            </div>

            {/* Visual Trend Chart Module */}
            <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp size={18} className="text-purple-400" />
                            Activity & Registration Timelines
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Displaying chronological distributions across the selected {selectedRange.toUpperCase()} window.
                        </p>
                    </div>

                    {/* Trend View Toggle */}
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                        <button
                            onClick={() => setTrendView("registrations")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                trendView === "registrations"
                                    ? "bg-white/10 text-white font-semibold"
                                    : "text-slate-400 hover:text-white"
                            }`}
                        >
                            Registrations
                        </button>
                        <button
                            onClick={() => setTrendView("assessments")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                trendView === "assessments"
                                    ? "bg-white/10 text-white font-semibold"
                                    : "text-slate-400 hover:text-white"
                            }`}
                        >
                            Assessments
                        </button>
                        <button
                            onClick={() => setTrendView("activity")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                trendView === "activity"
                                    ? "bg-white/10 text-white font-semibold"
                                    : "text-slate-400 hover:text-white"
                            }`}
                        >
                            Audit Events
                        </button>
                    </div>
                </div>

                {/* SVG & Bar Visualizer */}
                {activeTrends.length === 0 ? (
                    <div className="py-16 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] space-y-2">
                        <Calendar size={28} className="text-slate-600 mx-auto" />
                        <p className="text-sm font-semibold text-slate-400">No recorded events in this timeframe</p>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            Events will automatically plot here as new registrations, assessments, or administrative actions occur.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Interactive Bar Grid */}
                        <div className="h-56 flex items-end gap-2 pt-6 pb-2 px-2 border-b border-white/10">
                            {activeTrends.map((point) => {
                                const heightPct = Math.max(12, Math.round((point.count / maxTrendCount) * 100));
                                return (
                                    <div
                                        key={point.date}
                                        className="flex-1 flex flex-col items-center gap-2 group relative min-w-[28px]"
                                    >
                                        {/* Tooltip on hover */}
                                        <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-transform bg-slate-950 text-white text-[11px] font-bold px-2 py-1 rounded-md border border-white/20 whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                            {point.label}: {point.count} {trendView}
                                        </div>

                                        {/* Bar */}
                                        <div className="w-full max-w-[36px] bg-white/5 rounded-t-lg relative flex items-end justify-center overflow-hidden h-full">
                                            <div
                                                style={{ height: `${heightPct}%` }}
                                                className={`w-full rounded-t-md transition-all duration-500 ${
                                                    trendView === "registrations"
                                                        ? "bg-gradient-to-t from-cyan-500/40 via-cyan-400 to-cyan-300"
                                                        : trendView === "assessments"
                                                        ? "bg-gradient-to-t from-purple-500/40 via-purple-400 to-purple-300"
                                                        : "bg-gradient-to-t from-amber-500/40 via-amber-400 to-amber-300"
                                                }`}
                                            />
                                        </div>
                                        <span className="text-[10px] text-slate-500 truncate w-full text-center">
                                            {point.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {!data.hasHistoricalData && (
                            <p className="text-[11px] text-slate-500 italic text-right">
                                * Historical curve reflects single-epoch cluster. Extended daily trend lines expand as usage grows over time.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Distribution Metrics: Roles, Approvals, and Account Health */}
            <div className="grid md:grid-cols-3 gap-6">
                {/* 1. Role Distribution */}
                <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                            <Users size={16} className="text-cyan-400" />
                            Role Distribution
                        </h4>
                        <span className="text-xs text-slate-500">{overview.totalUsers || 0} Total</span>
                    </div>

                    <div className="space-y-3 pt-2">
                        {/* Students */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-purple-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Students
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {roleDist.students || 0} ({roleDist.studentsPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${roleDist.studentsPct || 0}%` }}
                                    className="h-full bg-purple-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>

                        {/* Teachers */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-pink-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" /> Teachers
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {roleDist.teachers || 0} ({roleDist.teachersPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${roleDist.teachersPct || 0}%` }}
                                    className="h-full bg-pink-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>

                        {/* Parents */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-blue-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Parents
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {roleDist.parents || 0} ({roleDist.parentsPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${roleDist.parentsPct || 0}%` }}
                                    className="h-full bg-blue-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Approval Status Breakdown */}
                <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-400" />
                            Approval Workflow Health
                        </h4>
                        <span className="text-xs text-slate-500">Centralized Gateway</span>
                    </div>

                    <div className="space-y-3 pt-2">
                        {/* Approved */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-emerald-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Approved
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {approvalDist.approved || 0} ({approvalDist.approvedPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${approvalDist.approvedPct || 0}%` }}
                                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>

                        {/* Pending */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-amber-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Pending Review
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {approvalDist.pending || 0} ({approvalDist.pendingPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${approvalDist.pendingPct || 0}%` }}
                                    className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>

                        {/* Rejected */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-red-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Rejected
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {approvalDist.rejected || 0} ({approvalDist.rejectedPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${approvalDist.rejectedPct || 0}%` }}
                                    className="h-full bg-red-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Account Status & Safety */}
                <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                            <Activity size={16} className="text-cyan-400" />
                            Account Standing & Suspension
                        </h4>
                        <span className="text-xs text-slate-500">Security State</span>
                    </div>

                    <div className="space-y-3 pt-2">
                        {/* Active */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-cyan-300 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Active
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {accountDist.active || 0} ({accountDist.activePct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${accountDist.activePct || 0}%` }}
                                    className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>

                        {/* Suspended */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-red-400 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Suspended
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {accountDist.suspended || 0} ({accountDist.suspendedPct || 0}%)
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${accountDist.suspendedPct || 0}%` }}
                                    className="h-full bg-red-500 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>

                        {/* Inactive */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Inactive
                                </span>
                                <span className="text-slate-400 font-semibold">
                                    {accountDist.inactive || 0}
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    style={{ width: `${accountDist.inactive ? 10 : 0}%` }}
                                    className="h-full bg-slate-500 rounded-full transition-all duration-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Assessment Analytics Module (Part D) */}
            <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Sparkles size={18} className="text-purple-400" />
                            Platform Assessment Analytics & AI Dyslexia Screening
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Cross-platform aggregate screening statistics and risk classifications.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 font-bold text-xs">
                            {overview.totalAssessmentsAvailable !== false && overview.totalAssessments !== null
                                ? `${overview.totalAssessments || 0} Completed Attempts`
                                : "Attempt History: Unavailable"}
                        </span>
                        <span className="px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-bold text-xs">
                            {overview.uniqueStudentsAssessed ?? (assessmentStats.uniqueStudentsAssessed ?? 0)} Unique Students Assessed
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Low Risk */}
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-xs text-emerald-300 font-semibold">Low Dyslexia Risk</span>
                        <p className="text-2xl font-bold text-white mt-1">{riskDist["Low Risk"] || 0}</p>
                        <p className="text-[11px] text-emerald-400/80 mt-1">Typical developmental markers</p>
                    </div>

                    {/* Moderate Risk */}
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <span className="text-xs text-amber-300 font-semibold">Moderate Risk</span>
                        <p className="text-2xl font-bold text-white mt-1">{riskDist["Moderate Risk"] || 0}</p>
                        <p className="text-[11px] text-amber-400/80 mt-1">Targeted practice recommended</p>
                    </div>

                    {/* High Risk */}
                    <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                        <span className="text-xs text-red-300 font-semibold">High Risk</span>
                        <p className="text-2xl font-bold text-white mt-1">{riskDist["High Risk"] || 0}</p>
                        <p className="text-[11px] text-red-400/80 mt-1">Specialist support prioritized</p>
                    </div>

                    {/* Not Assessed */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <span className="text-xs text-slate-400 font-semibold">Not Yet Assessed</span>
                        <p className="text-2xl font-bold text-white mt-1">{riskDist["Not Assessed"] || 0}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Students awaiting screening</p>
                    </div>
                </div>

                {/* Score & Type Breakdown */}
                <div className="grid md:grid-cols-2 gap-4 pt-2">
                    {/* Accuracy & Score Benchmarks */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                        <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Award size={14} className="text-amber-400" /> Average Assessment Benchmarks
                        </h5>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-white/5">
                                <span className="text-xs text-slate-400">Mean Accuracy</span>
                                <p className="text-xl font-bold text-cyan-300 mt-0.5">
                                    {assessmentStats.averageAccuracy ? `${assessmentStats.averageAccuracy}%` : "—"}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5">
                                <span className="text-xs text-slate-400">Mean Score</span>
                                <p className="text-xl font-bold text-purple-300 mt-0.5">
                                    {assessmentStats.averageScore ? assessmentStats.averageScore : "—"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Completed Practice Modules */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                        <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FileCheck size={14} className="text-purple-400" /> Completed Learning Exercises
                        </h5>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="p-2 rounded-xl bg-white/5">
                                <p className="font-bold text-white text-base">{typeBreakdown["Letter Recognition"] || 0}</p>
                                <span className="text-[10px] text-slate-400">Letter Exercises</span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/5">
                                <p className="font-bold text-white text-base">{typeBreakdown["Voice Practice"] || 0}</p>
                                <span className="text-[10px] text-slate-400">Voice Exercises</span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/5">
                                <p className="font-bold text-white text-base">{typeBreakdown["Word Practice"] || 0}</p>
                                <span className="text-[10px] text-slate-400">Word Exercises</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
