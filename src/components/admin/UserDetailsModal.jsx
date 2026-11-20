import { useState, useEffect, useCallback } from "react";
import {
    X,
    Mail,
    Shield,
    Clock,
    Activity,
    Award,
    Zap,
    Lock,
    Smartphone,
    CheckCircle2,
    XCircle,
    AlertOctagon,
    FileText,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Brain,
} from "lucide-react";
import { fetchUserDetails, fetchUserAssessments } from "../../services/adminService";

export default function UserDetailsModal({
    user,
    onClose,
    onApprove,
    onOpenReject,
    onOpenSuspend,
    onReactivate,
    currentAdminUid,
}) {
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    // Historical Assessments State (For Students)
    const [historicalAssessments, setHistoricalAssessments] = useState([]);
    const [loadingAssessments, setLoadingAssessments] = useState(false);
    const [asmtHasNext, setAsmtHasNext] = useState(false);
    const [asmtNextCursor, setAsmtNextCursor] = useState(null);
    const [asmtCursorStack, setAsmtCursorStack] = useState([]);
    const [asmtPageNumber, setAsmtPageNumber] = useState(1);

    const loadStudentAssessments = useCallback(async (targetCursor = null) => {
        if (!user?.id || user?.role !== "student") return;
        setLoadingAssessments(true);
        try {
            const res = await fetchUserAssessments(user.id, {
                limit: 4,
                cursor: targetCursor,
            });
            if (res) {
                setHistoricalAssessments(res.assessments || []);
                setAsmtHasNext(res.pagination?.hasNext || false);
                setAsmtNextCursor(res.pagination?.nextCursor || null);
            }
        } catch (err) {
            console.error("Failed to load historical assessments for user:", err);
        } finally {
            setLoadingAssessments(false);
        }
    }, [user?.id, user?.role]);

    useEffect(() => {
        let isMounted = true;
        async function load() {
            if (!user?.id) return;
            setLoading(true);
            try {
                const res = await fetchUserDetails(user.id);
                if (isMounted) {
                    setDetails(res || user);
                }
            } catch {
                if (isMounted) {
                    setDetails(user);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        load();
        if (user?.role === "student") {
            loadStudentAssessments(null);
        }
        return () => {
            isMounted = false;
        };
    }, [user, loadStudentAssessments]);

    const handleNextAsmtPage = () => {
        if (!asmtHasNext || !asmtNextCursor) return;
        setAsmtCursorStack((prev) => [...prev, asmtNextCursor]);
        setAsmtPageNumber((p) => p + 1);
        loadStudentAssessments(asmtNextCursor);
    };

    const handlePrevAsmtPage = () => {
        if (asmtCursorStack.length === 0) return;
        const newStack = [...asmtCursorStack];
        newStack.pop();
        const prevCursor = newStack.length > 0 ? newStack[newStack.length - 1] : null;
        setAsmtCursorStack(newStack);
        setAsmtPageNumber((p) => Math.max(1, p - 1));
        loadStudentAssessments(prevCursor);
    };

    if (!user) return null;

    const data = details || user;
    const isSelf = data.id === currentAdminUid;
    const isSuspended = data.accountStatus === "suspended";
    const isApproved = data.approvalStatus === "approved";
    const isPending = (data.approvalStatus || "pending") === "pending";

    const formatDate = (val) => {
        if (!val) return "—";
        try {
            const date = new Date(val?.toDate ? val.toDate() : val);
            return isNaN(date.getTime()) ? String(val) : date.toLocaleString();
        } catch {
            return String(val);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="relative w-full max-w-3xl my-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-950/60">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-lg">
                            {(data.name || data.email || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-white">{data.name || "Unnamed User"}</h3>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                                    data.role === "student"
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : data.role === "teacher"
                                        ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                        : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                }`}>
                                    {data.role || "student"}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <Mail size={12} /> {data.email}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Body */}
                <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="py-16 text-center space-y-3">
                            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="text-slate-400 text-sm">Loading complete user details...</p>
                        </div>
                    ) : (
                        <>
                            {/* Key Account Badges */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                                    <span className="text-slate-400 text-xs">Approval Status</span>
                                    <div className="flex items-center gap-1.5 mt-1 font-semibold text-sm">
                                        {data.approvalStatus === "approved" ? (
                                            <span className="text-emerald-400 flex items-center gap-1">
                                                <CheckCircle2 size={14} /> Approved
                                            </span>
                                        ) : data.approvalStatus === "rejected" ? (
                                            <span className="text-red-400 flex items-center gap-1">
                                                <XCircle size={14} /> Rejected
                                            </span>
                                        ) : (
                                            <span className="text-amber-400 flex items-center gap-1">
                                                <Clock size={14} /> Pending
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                                    <span className="text-slate-400 text-xs">Account Status</span>
                                    <div className="flex items-center gap-1.5 mt-1 font-semibold text-sm">
                                        {isSuspended ? (
                                            <span className="text-red-400 flex items-center gap-1">
                                                <AlertOctagon size={14} /> Suspended
                                            </span>
                                        ) : (
                                            <span className="text-emerald-400 flex items-center gap-1">
                                                <CheckCircle2 size={14} /> Active
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                                    <span className="text-slate-400 text-xs">Registered</span>
                                    <p className="text-white text-sm font-semibold mt-1">
                                        {data.createdAt ? new Date(data.createdAt).toLocaleDateString() : "—"}
                                    </p>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                                    <span className="text-slate-400 text-xs">Last Activity</span>
                                    <p className="text-white text-sm font-semibold mt-1">
                                        {data.lastLogin ? new Date(data.lastLogin).toLocaleDateString() : "Never"}
                                    </p>
                                </div>
                            </div>

                            {/* Identification & Security Section */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Shield size={14} className="text-cyan-400" />
                                    Identity & Security Details
                                </h4>
                                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <span className="text-slate-500">Firebase Auth UID:</span>
                                        <p className="text-slate-200 font-mono text-[11px] truncate mt-0.5 select-all">
                                            {data.id}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Parent Linkage:</span>
                                        <p className="text-slate-200 mt-0.5">
                                            {data.parentEmail || "No linked parent email"}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Guardian PIN Security:</span>
                                        <p className="text-slate-200 mt-0.5 flex items-center gap-1">
                                            <Lock size={12} className={data.hasGuardianPin ? "text-emerald-400" : "text-slate-500"} />
                                            {data.hasGuardianPin ? "PIN Configured" : "Not Set"}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Trusted Devices:</span>
                                        <p className="text-slate-200 mt-0.5 flex items-center gap-1">
                                            <Smartphone size={12} className="text-cyan-400" />
                                            {data.trustedDevicesCount || (data.trustedDevices || []).length} registered
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Student Learning & AI Assessment Details (If Student) */}
                            {data.role === "student" && (
                                <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3">
                                    <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                                        <Activity size={14} />
                                        Dyslexia Assessment & Learning Profile
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/10">
                                            <span className="text-purple-300/80">AI Risk Level</span>
                                            <p className="text-white font-bold text-sm mt-0.5">
                                                {data.lastRisk || "Not Assessed"}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/10">
                                            <span className="text-purple-300/80">Last Accuracy</span>
                                            <p className="text-white font-bold text-sm mt-0.5">
                                                {typeof data.lastAccuracy === "number" ? `${data.lastAccuracy}%` : "—"}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/10">
                                            <span className="text-purple-300/80">XP / Streak</span>
                                            <p className="text-white font-bold text-sm mt-0.5 flex items-center gap-1">
                                                <Zap size={12} className="text-amber-400" /> {data.xp || 0} XP
                                                <span className="text-slate-400 font-normal">({data.streak || 0}d)</span>
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/10">
                                            <span className="text-purple-300/80">Badges</span>
                                            <p className="text-white font-bold text-sm mt-0.5 flex items-center gap-1">
                                                <Award size={12} className="text-purple-400" /> {data.badges || 0} earned
                                            </p>
                                        </div>
                                    </div>

                                    {(data.voiceScore !== null || data.letterScore !== null || data.wordScore !== null) && (
                                        <div className="pt-2 border-t border-purple-500/10 grid grid-cols-3 gap-2 text-[11px] text-slate-300">
                                            <div>Voice Score: <span className="font-semibold text-white">{data.voiceScore ?? "—"}</span></div>
                                            <div>Letter Score: <span className="font-semibold text-white">{data.letterScore ?? "—"}</span></div>
                                            <div>Word Score: <span className="font-semibold text-white">{data.wordScore ?? "—"}</span></div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Student Historical Assessments (Phase 6.5 Super Admin User View) */}
                            {data.role === "student" && (
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Brain size={14} />
                                            Historical Screening Attempts ({historicalAssessments.length})
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={() => loadStudentAssessments(null)}
                                            disabled={loadingAssessments}
                                            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 disabled:opacity-50"
                                        >
                                            <RefreshCw size={11} className={loadingAssessments ? "animate-spin" : ""} />
                                            Refresh
                                        </button>
                                    </div>

                                    {loadingAssessments && historicalAssessments.length === 0 ? (
                                        <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
                                            Loading historical assessment records...
                                        </div>
                                    ) : historicalAssessments.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic py-2">
                                            No historical assessment records recorded for this student.
                                        </p>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {historicalAssessments.map((asmt) => (
                                                <div
                                                    key={asmt.id}
                                                    className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs space-y-2 hover:border-cyan-500/20 transition-all"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-white">
                                                                Score: {asmt.score}%
                                                            </span>
                                                            <span className="text-cyan-300">
                                                                (Acc: {asmt.accuracy}%)
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                                asmt.risk === "Low Risk"
                                                                    ? "bg-emerald-500/20 text-emerald-300"
                                                                    : asmt.risk === "Moderate Risk"
                                                                    ? "bg-amber-500/20 text-amber-300"
                                                                    : "bg-rose-500/20 text-rose-300"
                                                            }`}>
                                                                {asmt.risk}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 font-mono">
                                                            {asmt.completedAt ? new Date(asmt.completedAt).toLocaleDateString() : "—"}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                                        <span>Voice: <strong className="text-white">{asmt.subScores?.voiceAccuracy ?? 0}%</strong></span>
                                                        <span>Letter: <strong className="text-white">{asmt.subScores?.letterScore ?? 0}/7</strong></span>
                                                        <span>Word: <strong className="text-white">{asmt.subScores?.wordScore ?? 0}/7</strong></span>
                                                    </div>

                                                    {((asmt.insights?.strengths?.length || 0) > 0 || (asmt.insights?.improvements?.length || 0) > 0) && (
                                                        <div className="text-[10px] space-y-1 pt-1 border-t border-white/5">
                                                            {asmt.insights?.strengths?.length > 0 && (
                                                                <p className="text-emerald-300 truncate">
                                                                    ✓ Strengths: {asmt.insights.strengths.join(", ")}
                                                                </p>
                                                            )}
                                                            {asmt.insights?.improvements?.length > 0 && (
                                                                <p className="text-amber-300 truncate">
                                                                    • Target Areas: {asmt.insights.improvements.join(", ")}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {/* Cursor Pagination in Modal */}
                                            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                                                <span>Page {asmtPageNumber}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={handlePrevAsmtPage}
                                                        disabled={asmtPageNumber === 1 || loadingAssessments}
                                                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white flex items-center gap-1"
                                                    >
                                                        <ChevronLeft size={12} /> Prev
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleNextAsmtPage}
                                                        disabled={!asmtHasNext || loadingAssessments}
                                                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white flex items-center gap-1"
                                                    >
                                                        Next <ChevronRight size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Rejection / Suspension Notes */}
                            {(data.rejectionReason || data.suspensionReason) && (
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                                    <span className="font-semibold text-amber-300">Administrative Notice:</span>
                                    {data.rejectionReason && (
                                        <p className="text-slate-300">
                                            Rejection Reason: <span className="italic">&ldquo;{data.rejectionReason}&rdquo;</span>
                                        </p>
                                    )}
                                    {data.suspensionReason && (
                                        <p className="text-slate-300">
                                            Suspension Reason: <span className="italic">&ldquo;{data.suspensionReason}&rdquo;</span>
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Audit & Administrative Trail for this User */}
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText size={14} className="text-cyan-400" />
                                    Audit & Decision History
                                </h4>
                                {!data.auditTrail || data.auditTrail.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-2">
                                        No prior administrative interventions recorded for this account.
                                    </p>
                                ) : (
                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                        {data.auditTrail.map((log) => (
                                            <div
                                                key={log.id}
                                                className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs flex items-start justify-between gap-3"
                                            >
                                                <div>
                                                    <span className="font-semibold text-white">{log.action}</span>
                                                    {log.reason && (
                                                        <p className="text-amber-300/80 text-[11px] mt-0.5 italic">
                                                            &ldquo;{log.reason}&rdquo;
                                                        </p>
                                                    )}
                                                    <p className="text-slate-500 text-[10px] mt-0.5">
                                                        Admin: {log.adminEmail || log.adminId}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] text-slate-400 shrink-0">
                                                    {formatDate(log.timestamp)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-white/10 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium transition-colors"
                    >
                        Close
                    </button>

                    {isSelf ? (
                        <p className="text-xs text-slate-500 italic">
                            Current Super Admin identity cannot be modified.
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Approve Button */}
                            {!isApproved && (
                                <button
                                    onClick={() => {
                                        onApprove(data.id);
                                        onClose();
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-500/20"
                                >
                                    <CheckCircle2 size={14} /> Approve User
                                </button>
                            )}

                            {/* Reject Button */}
                            {isPending && (
                                <button
                                    onClick={() => {
                                        onClose();
                                        onOpenReject(data);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <XCircle size={14} /> Reject
                                </button>
                            )}

                            {/* Suspend / Reactivate */}
                            {isSuspended ? (
                                <button
                                    onClick={() => {
                                        onReactivate(data.id);
                                        onClose();
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <RefreshCw size={14} /> Reactivate Account
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        onClose();
                                        onOpenSuspend(data);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <AlertOctagon size={14} /> Suspend
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
