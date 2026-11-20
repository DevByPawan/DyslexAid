import { useState, useEffect, useCallback } from "react";
import {
    Activity,
    Award,
    Calendar,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    ShieldAlert,
    Brain,
    Mic,
    Type,
    FileText,
} from "lucide-react";
import {
    fetchStudentAssessmentsPaginated,
    fetchStudentProgressTimeline,
    fetchTeacherStudentAssessmentsPaginated,
    fetchTeacherStudentProgressTimeline,
    fetchParentChildAssessmentsPaginated,
    fetchParentChildProgressTimeline,
} from "../../services/studentAssessmentService";

export default function StudentAssessmentHistory({
    userId,
    viewerRole = "student",
    studentName = null,
}) {
    const [assessments, setAssessments] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Cursor pagination state
    const [pageSize] = useState(5);
    const [hasNext, setHasNext] = useState(false);
    const [cursorDoc, setCursorDoc] = useState(null);
    const [cursorStack, setCursorStack] = useState([]); // Array of cursorDocs
    const [pageNumber, setPageNumber] = useState(1);

    // Reset pagination state when active user or role changes
    useEffect(() => {
        setCursorDoc(null);
        setCursorStack([]);
        setPageNumber(1);
    }, [userId, viewerRole]);

    const loadData = useCallback(async (targetCursor = null) => {
        if (!userId) {
            setLoading(false);
            setAssessments([]);
            setTimeline([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            let historyPromise;
            let timelinePromise;

            if (viewerRole === "teacher") {
                historyPromise = fetchTeacherStudentAssessmentsPaginated({
                    studentId: userId,
                    pageSize,
                    cursorDoc: targetCursor,
                });
                timelinePromise = fetchTeacherStudentProgressTimeline(userId);
            } else if (viewerRole === "parent") {
                historyPromise = fetchParentChildAssessmentsPaginated({
                    childId: userId,
                    pageSize,
                    cursorDoc: targetCursor,
                });
                timelinePromise = fetchParentChildProgressTimeline(userId);
            } else {
                historyPromise = fetchStudentAssessmentsPaginated({
                    userId,
                    pageSize,
                    cursorDoc: targetCursor,
                });
                timelinePromise = fetchStudentProgressTimeline(userId);
            }

            const [historyRes, timelineRes] = await Promise.all([
                historyPromise,
                timelinePromise,
            ]);

            setAssessments(historyRes.assessments);
            setHasNext(historyRes.hasNext);
            setCursorDoc(historyRes.nextCursorDoc);
            setTimeline(timelineRes);
        } catch (err) {
            console.error("Failed to load assessment history:", err);
            setError(err.message || "Unable to load assessment history. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [userId, viewerRole, pageSize]);

    useEffect(() => {
        loadData(null);
    }, [loadData]);

    const handleNextPage = () => {
        if (!hasNext || !cursorDoc) return;
        setCursorStack((prev) => [...prev, cursorDoc]);
        setPageNumber((p) => p + 1);
        loadData(cursorDoc);
    };

    const handlePrevPage = () => {
        if (cursorStack.length === 0) return;
        const newStack = [...cursorStack];
        newStack.pop(); // Remove current page's cursor
        const prevCursor = newStack.length > 0 ? newStack[newStack.length - 1] : null;
        setCursorStack(newStack);
        setPageNumber((p) => Math.max(1, p - 1));
        loadData(prevCursor);
    };

    const formatDate = (millis) => {
        if (!millis) return "Unknown Date";
        return new Date(millis).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const getRiskTheme = (risk) => {
        switch (risk) {
            case "Low Risk":
                return {
                    bg: "bg-emerald-500/10",
                    border: "border-emerald-500/30",
                    text: "text-emerald-400",
                    badge: "bg-emerald-500/20 text-emerald-300",
                    icon: CheckCircle2,
                };
            case "Moderate Risk":
                return {
                    bg: "bg-amber-500/10",
                    border: "border-amber-500/30",
                    text: "text-amber-400",
                    badge: "bg-amber-500/20 text-amber-300",
                    icon: AlertCircle,
                };
            case "High Risk":
                return {
                    bg: "bg-rose-500/10",
                    border: "border-rose-500/30",
                    text: "text-rose-400",
                    badge: "bg-rose-500/20 text-rose-300",
                    icon: ShieldAlert,
                };
            default:
                return {
                    bg: "bg-slate-500/10",
                    border: "border-slate-500/30",
                    text: "text-slate-400",
                    badge: "bg-slate-500/20 text-slate-300",
                    icon: Activity,
                };
        }
    };

    // Calculate progression metrics
    const initialScore = timeline.length > 0 ? timeline[0].score : null;
    const latestScore = timeline.length > 0 ? timeline[timeline.length - 1].score : null;
    const scoreDelta = (initialScore !== null && latestScore !== null) ? latestScore - initialScore : 0;
    const highestAccuracy = timeline.length > 0 ? Math.max(...timeline.map((t) => t.accuracy)) : null;

    const headerTitle =
        viewerRole === "teacher"
            ? `Student Assessment History & Progress${studentName ? ` – ${studentName}` : ""}`
            : viewerRole === "parent"
            ? `Child Assessment History & Progress${studentName ? ` – ${studentName}` : ""}`
            : "Assessment History & Learning Progress";

    const headerSubtitle =
        viewerRole === "teacher"
            ? `Chronological evaluation history, phonics scores, and skill progression${studentName ? ` for ${studentName}` : ""}.`
            : viewerRole === "parent"
            ? `Track your child's phonics screenings, score improvements, and learning milestones over time.`
            : "Track your dyslexia screening attempts, score improvements, and skill progression over time.";

    const emptyTitle =
        viewerRole === "teacher"
            ? "No Assessment History Available"
            : viewerRole === "parent"
            ? "No Assessment History Recorded"
            : "No Assessment History Recorded";

    const emptySubtitle =
        viewerRole === "teacher"
            ? "This student has not completed any AI dyslexia screenings yet."
            : viewerRole === "parent"
            ? "Your child has not completed any AI dyslexia screenings yet."
            : "You have not completed any AI dyslexia screenings yet. Start an assessment to generate your personalized risk evaluation and baseline metrics.";

    return (
        <div className="space-y-8 mt-10">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <TrendingUp className="text-cyan-400" size={28} />
                        {headerTitle}
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        {headerSubtitle}
                    </p>
                </div>
                <button
                    onClick={() => loadData(null)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-xs font-semibold transition-all disabled:opacity-50 self-start sm:self-center"
                    title="Refresh assessment history"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin text-cyan-400" : ""} />
                    {loading ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div className="p-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="text-rose-400 flex-shrink-0" size={24} />
                        <p className="text-sm font-semibold">{error}</p>
                    </div>
                    <button
                        onClick={() => loadData(null)}
                        className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-xs font-bold text-white transition-all"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Progress Visualization Chart (Part A) */}
            {timeline.length > 0 && (
                <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Activity className="text-cyan-400" size={20} />
                                Phonics Accuracy & Score Trend Line
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Chronological performance across {timeline.length} evaluation{timeline.length > 1 ? "s" : ""}
                            </p>
                        </div>

                        {/* Summary Badges */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-300 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                                Overall Score: {latestScore}%
                                {scoreDelta !== 0 && (
                                    <span className={`text-[10px] font-bold ${scoreDelta > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                        ({scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}%)
                                    </span>
                                )}
                            </div>
                            <div className="px-3 py-1.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs font-semibold text-pink-300 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-pink-400" />
                                Best Accuracy: {highestAccuracy}%
                            </div>
                        </div>
                    </div>

                    {/* SVG Chart Render */}
                    <div className="relative pt-4 pb-2">
                        {timeline.length === 1 ? (
                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center space-y-2">
                                <Award className="text-cyan-400 mx-auto" size={32} />
                                <h4 className="text-sm font-bold text-white">Baseline Assessment Established</h4>
                                <p className="text-xs text-slate-400 max-w-md mx-auto">
                                    You completed your first screening with a composite score of {timeline[0].score}% and reading accuracy of {timeline[0].accuracy}%. Complete subsequent assessments to unlock full longitudinal progress graphs.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <svg
                                    viewBox="0 0 700 200"
                                    className="w-full h-48 select-none"
                                    preserveAspectRatio="none"
                                >
                                    <defs>
                                        <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                                            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                                        </linearGradient>
                                        <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#f472b6" stopOpacity="0.3" />
                                            <stop offset="100%" stopColor="#f472b6" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>

                                    {/* Grid Lines */}
                                    <line x1="40" y1="20" x2="680" y2="20" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                                    <line x1="40" y1="95" x2="680" y2="95" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                                    <line x1="40" y1="170" x2="680" y2="170" stroke="rgba(255,255,255,0.08)" />

                                    {/* Y-Axis Labels */}
                                    <text x="10" y="25" fill="#64748b" fontSize="10">100%</text>
                                    <text x="15" y="100" fill="#64748b" fontSize="10">50%</text>
                                    <text x="20" y="175" fill="#64748b" fontSize="10">0%</text>

                                    {/* Compute Coordinate Points */}
                                    {(() => {
                                        const xMin = 50;
                                        const xMax = 670;
                                        const yMin = 20; // 100%
                                        const yMax = 170; // 0%
                                        const stepX = (xMax - xMin) / (timeline.length - 1);

                                        const scorePoints = timeline.map((pt, idx) => {
                                            const x = xMin + idx * stepX;
                                            const y = yMax - (pt.score / 100) * (yMax - yMin);
                                            return `${x},${y}`;
                                        }).join(" ");

                                        const accuracyPoints = timeline.map((pt, idx) => {
                                            const x = xMin + idx * stepX;
                                            const y = yMax - (pt.accuracy / 100) * (yMax - yMin);
                                            return `${x},${y}`;
                                        }).join(" ");

                                        const firstX = xMin;
                                        const lastX = xMin + (timeline.length - 1) * stepX;
                                        const scoreArea = `${firstX},${yMax} ${scorePoints} ${lastX},${yMax}`;

                                        return (
                                            <>
                                                {/* Area fill */}
                                                <polygon points={scoreArea} fill="url(#scoreGradient)" />

                                                {/* Trend Lines */}
                                                <polyline
                                                    fill="none"
                                                    stroke="#f472b6"
                                                    strokeWidth="2.5"
                                                    strokeDasharray="4 3"
                                                    points={accuracyPoints}
                                                />
                                                <polyline
                                                    fill="none"
                                                    stroke="#22d3ee"
                                                    strokeWidth="3"
                                                    points={scorePoints}
                                                />

                                                {/* Data Points */}
                                                {timeline.map((pt, idx) => {
                                                    const x = xMin + idx * stepX;
                                                    const yScore = yMax - (pt.score / 100) * (yMax - yMin);
                                                    const yAcc = yMax - (pt.accuracy / 100) * (yMax - yMin);

                                                    return (
                                                        <g key={pt.id || idx}>
                                                            <circle cx={x} cy={yScore} r="4.5" fill="#22d3ee" stroke="#0f172a" strokeWidth="2" />
                                                            <circle cx={x} cy={yAcc} r="3.5" fill="#f472b6" stroke="#0f172a" strokeWidth="1.5" />
                                                        </g>
                                                    );
                                                })}
                                            </>
                                        );
                                    })()}
                                </svg>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Historical Assessment Entries (Part B) */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="text-cyan-400" size={22} />
                        Completed Assessment Records
                    </h3>
                    <span className="text-xs text-slate-400 font-semibold">
                        Showing page {pageNumber}
                    </span>
                </div>

                {/* Loading Skeleton */}
                {loading && (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="p-6 rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl animate-pulse space-y-4"
                            >
                                <div className="h-5 w-48 bg-white/10 rounded-lg" />
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="h-10 bg-white/5 rounded-xl" />
                                    <div className="h-10 bg-white/5 rounded-xl" />
                                    <div className="h-10 bg-white/5 rounded-xl" />
                                    <div className="h-10 bg-white/5 rounded-xl" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!loading && assessments.length === 0 && (
                    <div className="p-12 text-center rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl space-y-4">
                        <Brain className="text-cyan-400 mx-auto" size={44} />
                        <h4 className="text-lg font-bold text-white">{emptyTitle}</h4>
                        <p className="text-slate-400 text-sm max-w-md mx-auto">
                            {emptySubtitle}
                        </p>
                    </div>
                )}

                {/* Assessment Cards */}
                {!loading && assessments.length > 0 && (
                    <div className="space-y-4">
                        {assessments.map((asmt) => {
                            const riskTheme = getRiskTheme(asmt.risk);
                            const RiskIcon = riskTheme.icon;

                            return (
                                <div
                                    key={asmt.id}
                                    className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl hover:border-cyan-500/30 transition-all space-y-4"
                                >
                                    {/* Card Header */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                                <Brain size={18} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-white">
                                                    Comprehensive Screening Attempt
                                                </h4>
                                                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                                    <Calendar size={12} />
                                                    {formatDate(asmt.completedAt)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Risk Badges */}
                                        <div className="flex items-center gap-2 self-start sm:self-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${riskTheme.badge} ${riskTheme.border}`}>
                                                <RiskIcon size={13} />
                                                {asmt.risk}
                                            </span>
                                            {asmt.mlRisk && asmt.mlRisk !== asmt.risk && (
                                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-slate-300">
                                                    ML: {asmt.mlRisk}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Performance Metrics Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                                            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                                                Composite Score
                                            </span>
                                            <span className="text-2xl font-bold text-white">
                                                {asmt.score}%
                                            </span>
                                        </div>

                                        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                                            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                                                Reading Accuracy
                                            </span>
                                            <span className="text-2xl font-bold text-cyan-300">
                                                {asmt.accuracy}%
                                            </span>
                                        </div>

                                        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 col-span-2 sm:col-span-2">
                                            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                                                Sub-Test Breakdown
                                            </span>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <span className="px-2 py-0.5 rounded-lg bg-white/5 text-[11px] font-medium text-slate-300 flex items-center gap-1">
                                                    <Mic size={11} className="text-cyan-400" />
                                                    Voice: {asmt.subScores?.voiceAccuracy ?? 0}%
                                                </span>
                                                <span className="px-2 py-0.5 rounded-lg bg-white/5 text-[11px] font-medium text-slate-300 flex items-center gap-1">
                                                    <Type size={11} className="text-pink-400" />
                                                    Letter: {asmt.subScores?.letterScore ?? 0}/7
                                                </span>
                                                <span className="px-2 py-0.5 rounded-lg bg-white/5 text-[11px] font-medium text-slate-300 flex items-center gap-1">
                                                    <FileText size={11} className="text-purple-400" />
                                                    Word: {asmt.subScores?.wordScore ?? 0}/7
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Strengths & Improvements Tags */}
                                    {((asmt.insights?.strengths?.length || 0) > 0 || (asmt.insights?.improvements?.length || 0) > 0) && (
                                        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                            {asmt.insights?.strengths?.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="font-semibold text-emerald-400 mr-1">Strengths:</span>
                                                    {asmt.insights.strengths.map((str, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]"
                                                        >
                                                            ✓ {str}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {asmt.insights?.improvements?.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="font-semibold text-amber-400 mr-1">Target Areas:</span>
                                                    {asmt.insights.improvements.map((imp, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]"
                                                        >
                                                            • {imp}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Pagination Controls */}
                        <div className="flex items-center justify-between pt-4 border-t border-white/10">
                            <button
                                onClick={handlePrevPage}
                                disabled={pageNumber === 1 || loading}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft size={16} />
                                Previous
                            </button>

                            <span className="text-xs text-slate-400 font-medium">
                                Page {pageNumber}
                            </span>

                            <button
                                onClick={handleNextPage}
                                disabled={!hasNext || loading}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Next
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

