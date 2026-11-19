import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminNavbar from "../components/admin/AdminNavbar";
import UserDetailsModal from "../components/admin/UserDetailsModal";
import AnalyticsVisualizer from "../components/admin/AnalyticsVisualizer";
import SystemHealthMonitor from "../components/admin/SystemHealthMonitor";
import {
    Users,
    UserCheck,
    UserX,
    ShieldCheck,
    Clock,
    Activity,
    Search,
    CheckCircle2,
    AlertOctagon,
    RefreshCw,
    HelpCircle,
    ChevronLeft,
    ChevronRight,
    Eye,
    Filter,
    ArrowUpDown,
    Check,
    TrendingUp,
    FileCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import {
    approveUser,
    rejectUser,
    suspendUser,
    reactivateUser,
    fetchPlatformOverview,
    fetchPlatformAnalytics,
    fetchUsersPaginated,
    fetchAuditLogsPaginated,
} from "../services/adminService";

// ── Overview Section (Part A) ───────────────────────────────────────────────

function OverviewSection({
    overviewData,
    loadingOverview,
    pendingCount,
    onNavigateApprovals,
    onNavigateUsers,
    onNavigateAnalytics,
    onNavigateMonitoring,
}) {
    const o = overviewData || {};

    const cards = [
        {
            label: "Total Registered Users",
            value: o.totalUsers ?? 0,
            icon: Users,
            color: "from-cyan-500/20 to-cyan-500/5",
            border: "border-cyan-500/30",
            iconColor: "text-cyan-400",
            subtext: "Platform directory",
        },
        {
            label: "Pending Approvals",
            value: pendingCount,
            icon: Clock,
            color: "from-amber-500/20 to-amber-500/5",
            border: "border-amber-500/30",
            iconColor: "text-amber-400",
            highlight: pendingCount > 0,
            subtext: "Requires review",
        },
        {
            label: "Approved Accounts",
            value: o.approvedUsers ?? 0,
            icon: CheckCircle2,
            color: "from-emerald-500/20 to-emerald-500/5",
            border: "border-emerald-500/30",
            iconColor: "text-emerald-400",
            subtext: "Full access granted",
        },
        {
            label: "Suspended Accounts",
            value: o.suspendedUsers ?? 0,
            icon: AlertOctagon,
            color: "from-red-500/20 to-red-500/5",
            border: "border-red-500/30",
            iconColor: "text-red-400",
            subtext: "Access restricted",
        },
        {
            label: "Registered Students",
            value: o.students ?? 0,
            icon: UserCheck,
            color: "from-purple-500/20 to-purple-500/5",
            border: "border-purple-500/30",
            iconColor: "text-purple-400",
            subtext: "Learning accounts",
        },
        {
            label: "Teachers",
            value: o.teachers ?? 0,
            icon: UserCheck,
            color: "from-pink-500/20 to-pink-500/5",
            border: "border-pink-500/30",
            iconColor: "text-pink-400",
            subtext: "Educator access",
        },
        {
            label: "Parents",
            value: o.parents ?? 0,
            icon: Users,
            color: "from-blue-500/20 to-blue-500/5",
            border: "border-blue-500/30",
            iconColor: "text-blue-400",
            subtext: "Guardian links",
        },
        {
            label: "Active Users",
            value: o.activeUsers ?? (o.totalUsers - (o.suspendedUsers || 0)),
            icon: Activity,
            color: "from-teal-500/20 to-teal-500/5",
            border: "border-teal-500/30",
            iconColor: "text-teal-400",
            subtext: "In good standing",
        },
        {
            label: "Rejected Registrations",
            value: o.rejectedUsers ?? 0,
            icon: UserX,
            color: "from-rose-500/20 to-rose-500/5",
            border: "border-rose-500/30",
            iconColor: "text-rose-400",
            subtext: "Declined applications",
        },
        {
            label: "Assessments Completed",
            value: o.totalAssessmentsAvailable === false || o.totalAssessments === null
                ? "Unavailable"
                : (o.totalAssessments ?? 0),
            icon: FileCheck,
            color: "from-indigo-500/20 to-indigo-500/5",
            border: "border-indigo-500/30",
            iconColor: "text-indigo-400",
            subtext: o.totalAssessmentsAvailable === false || o.totalAssessments === null
                ? `${o.uniqueStudentsAssessed ?? 0} unique students assessed (attempt logs unrecorded)`
                : `${o.uniqueStudentsAssessed ?? 0} unique students assessed`,
        },
    ];

    return (
        <div className="space-y-8">
            {/* Banner */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 p-8 shadow-2xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-400 to-pink-400 shadow-md">
                                <ShieldCheck size={20} className="text-black" />
                            </div>
                            <span className="text-cyan-300 text-xs font-bold tracking-wider uppercase">
                                Centralized Primary Super Admin Portal
                            </span>
                        </div>
                        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
                            DyslexAid Command Center
                        </h2>
                        <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
                            Full governance over user registrations, account lifecycles, platform analytics,
                            and AI dyslexia assessment health.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {pendingCount > 0 && (
                            <button
                                onClick={onNavigateApprovals}
                                className="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95"
                            >
                                <Clock size={16} />
                                Review {pendingCount} Pending
                            </button>
                        )}
                        <button
                            onClick={onNavigateUsers}
                            className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm flex items-center gap-2 transition-all"
                        >
                            <Users size={16} /> All Users
                        </button>
                        <button
                            onClick={onNavigateAnalytics}
                            className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm flex items-center gap-2 transition-all"
                        >
                            <TrendingUp size={16} className="text-cyan-400" /> Insights
                        </button>
                        <button
                            onClick={onNavigateMonitoring}
                            className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm flex items-center gap-2 transition-all"
                        >
                            <Activity size={16} className="text-emerald-400" /> System Health
                        </button>
                    </div>
                </div>
            </div>

            {/* Grid of 10 Overview Cards */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity size={18} className="text-cyan-400" /> Platform Overview Metrics
                    </h3>
                    <span className="text-xs text-slate-500">Live Server Aggregates</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {cards.map(({ label, value, icon: Icon, color, border, iconColor, highlight, subtext }) => (
                        <div
                            key={label}
                            className={`rounded-2xl border ${border} bg-gradient-to-br ${color} p-4.5 flex flex-col justify-between transition-all hover:border-white/20 ${
                                highlight ? "ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/10" : ""
                            }`}
                        >
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className={`${iconColor} p-2 rounded-xl bg-white/5`}>
                                        <Icon size={18} />
                                    </div>
                                    {highlight && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-black">
                                            Action
                                        </span>
                                    )}
                                </div>
                                <p className="text-slate-400 text-xs font-medium">{label}</p>
                            </div>
                            <div className="mt-3">
                                <p className="text-white text-2xl font-bold tracking-tight">
                                    {loadingOverview ? (
                                        <span className="inline-block w-12 h-7 rounded bg-white/10 animate-pulse" />
                                    ) : (
                                        value
                                    )}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{subtext}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── User Approvals Queue Section ────────────────────────────────────────────

function ApprovalsSection({
    users,
    loading,
    onRefresh,
    onOpenApprove,
    onOpenReject,
    onOpenInfoModal,
    onViewDetails,
}) {
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    const pendingUsers = useMemo(() => {
        return users.filter((u) => {
            const isPending = (u.approvalStatus || "pending") === "pending";
            const matchesSearch =
                (u.name || "").toLowerCase().includes(search.toLowerCase()) ||
                (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
                u.id.toLowerCase().includes(search.toLowerCase());
            const matchesRole = roleFilter === "all" || u.role === roleFilter;
            return isPending && matchesSearch && matchesRole;
        });
    }, [users, search, roleFilter]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Clock className="text-amber-400" size={24} />
                        Registration Approval Queue
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">
                        Review submitted registration requests before users gain protected platform access.
                    </p>
                </div>
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-colors self-start sm:self-auto"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Queue
                </button>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search pending applications by name, email, or UID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-amber-400 text-xs"
                    />
                </div>
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white outline-none text-xs"
                >
                    <option value="all">All Roles</option>
                    <option value="student">Students</option>
                    <option value="teacher">Teachers</option>
                    <option value="parent">Parents</option>
                </select>
            </div>

            {/* Queue Table */}
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-xl">
                {pendingUsers.length === 0 ? (
                    <div className="py-20 text-center space-y-3">
                        <CheckCircle2 size={40} className="text-emerald-400 mx-auto opacity-70" />
                        <h4 className="text-base font-bold text-white">All Caught Up!</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            There are currently no registration requests awaiting approval matching your filter.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase tracking-wider font-semibold">
                                <tr>
                                    <th className="p-4">User Details</th>
                                    <th className="p-4">Requested Role</th>
                                    <th className="p-4">Registration Date</th>
                                    <th className="p-4">Parent Link / Context</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                                {pendingUsers.map((u) => (
                                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-4">
                                            <p className="font-bold text-white text-sm">{u.name || "—"}</p>
                                            <p className="text-slate-400 text-xs">{u.email}</p>
                                            <p className="text-[10px] text-slate-600 font-mono select-all">UID: {u.id}</p>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] uppercase ${
                                                u.role === "student"
                                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                                    : u.role === "teacher"
                                                    ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                                    : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                            }`}>
                                                {u.role || "student"}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-400">
                                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="p-4 text-slate-400 text-[11px]">
                                            {u.parentEmail ? (
                                                <span className="text-cyan-300 font-mono">Linked: {u.parentEmail}</span>
                                            ) : (
                                                <span className="text-slate-500">None specified</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => onViewDetails(u)}
                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                                    title="View Full Profile"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                <button
                                                    onClick={() => onOpenInfoModal(u)}
                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                                                    title="Inquire via Email"
                                                >
                                                    <HelpCircle size={14} />
                                                </button>
                                                <button
                                                    onClick={() => onOpenReject(u)}
                                                    className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 font-semibold"
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => onOpenApprove(u)}
                                                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1"
                                                >
                                                    <Check size={12} /> Approve
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Complete User Management Section (Part B) ───────────────────────────────

function AllUsersSection({
    usersData,
    loading,
    filters,
    onFilterChange,
    onPageChange,
    onRefresh,
    onViewDetails,
    onOpenApprove,
    onOpenReject,
    onOpenSuspend,
    onOpenReactivate,
    currentAdminUid,
}) {
    const { users = [], pagination = {} } = usersData || {};
    const { total = 0, page = 1, limit = 10, totalPages = 1 } = pagination;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Users className="text-cyan-400" size={24} />
                        Platform User Management
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">
                        Directory of registered students, educators, and guardians. Search, filter, and govern access.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                        Total Records: <strong className="text-white">{total}</strong>
                    </span>
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
                <div className="flex flex-col lg:flex-row gap-3">
                    {/* Search by Name, Email, or UID */}
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or Firebase Auth UID..."
                            value={filters.search}
                            onChange={(e) => onFilterChange("search", e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 text-xs"
                        />
                    </div>

                    {/* Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Role Filter */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                            <Filter size={12} className="text-slate-400" />
                            <select
                                value={filters.role}
                                onChange={(e) => onFilterChange("role", e.target.value)}
                                className="bg-transparent text-white outline-none cursor-pointer"
                            >
                                <option value="all" className="bg-slate-900">All Roles</option>
                                <option value="student" className="bg-slate-900">Students</option>
                                <option value="teacher" className="bg-slate-900">Teachers</option>
                                <option value="parent" className="bg-slate-900">Parents</option>
                            </select>
                        </div>

                        {/* Approval Status Filter */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                            <select
                                value={filters.approvalStatus}
                                onChange={(e) => onFilterChange("approvalStatus", e.target.value)}
                                className="bg-transparent text-white outline-none cursor-pointer"
                            >
                                <option value="all" className="bg-slate-900">All Approvals</option>
                                <option value="approved" className="bg-slate-900">Approved</option>
                                <option value="pending" className="bg-slate-900">Pending</option>
                                <option value="rejected" className="bg-slate-900">Rejected</option>
                            </select>
                        </div>

                        {/* Account Status Filter */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                            <select
                                value={filters.accountStatus}
                                onChange={(e) => onFilterChange("accountStatus", e.target.value)}
                                className="bg-transparent text-white outline-none cursor-pointer"
                            >
                                <option value="all" className="bg-slate-900">All Standings</option>
                                <option value="active" className="bg-slate-900">Active</option>
                                <option value="suspended" className="bg-slate-900">Suspended</option>
                            </select>
                        </div>

                        {/* Sort By */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                            <ArrowUpDown size={12} className="text-slate-400" />
                            <select
                                value={filters.sortBy}
                                onChange={(e) => onFilterChange("sortBy", e.target.value)}
                                className="bg-transparent text-white outline-none cursor-pointer"
                            >
                                <option value="createdAt" className="bg-slate-900">Registration Date</option>
                                <option value="name" className="bg-slate-900">Name</option>
                                <option value="xp" className="bg-slate-900">XP Points</option>
                                <option value="streak" className="bg-slate-900">Login Streak</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Users Data Table */}
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-xl">
                {users.length === 0 ? (
                    <div className="py-20 text-center space-y-3">
                        <Users size={40} className="text-slate-600 mx-auto" />
                        <h4 className="text-base font-bold text-white">No Users Found</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            No registered users match your search and filter criteria.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase tracking-wider font-semibold">
                                <tr>
                                    <th className="p-4">User</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4">Approval</th>
                                    <th className="p-4">Standing</th>
                                    <th className="p-4">Learning / Risk</th>
                                    <th className="p-4">Registered</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                                {users.map((u) => {
                                    const isSuspended = u.accountStatus === "suspended";
                                    const isApproved = u.approvalStatus === "approved";
                                    const isPending = (u.approvalStatus || "pending") === "pending";
                                    const isSelf = u.id === currentAdminUid;

                                    return (
                                        <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                                                        {(u.name || u.email || "U").charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white text-sm">{u.name || "—"}</p>
                                                        <p className="text-slate-400 text-xs">{u.email}</p>
                                                        <p className="text-[10px] text-slate-600 font-mono select-all truncate max-w-[140px]">
                                                            {u.id}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="p-4 capitalize">
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                                    u.role === "student"
                                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                                        : u.role === "teacher"
                                                        ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                                        : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                                }`}>
                                                    {u.role || "student"}
                                                </span>
                                            </td>

                                            <td className="p-4">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                                    isApproved
                                                        ? "bg-emerald-500/20 text-emerald-300"
                                                        : u.approvalStatus === "rejected"
                                                        ? "bg-red-500/20 text-red-300"
                                                        : "bg-amber-500/20 text-amber-300"
                                                }`}>
                                                    {u.approvalStatus || "pending"}
                                                </span>
                                            </td>

                                            <td className="p-4">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                                    isSuspended
                                                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                                        : "bg-emerald-500/20 text-emerald-300"
                                                }`}>
                                                    {u.accountStatus || "active"}
                                                </span>
                                            </td>

                                            <td className="p-4 text-slate-400">
                                                {u.role === "student" ? (
                                                    <div>
                                                        <span className="text-white font-medium">{u.xp || 0} XP</span> • {u.streak || 0}d
                                                        {u.lastRisk && (
                                                            <p className="text-[10px] text-purple-300 mt-0.5">
                                                                Risk: {u.lastRisk}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500">—</span>
                                                )}
                                            </td>

                                            <td className="p-4 text-slate-400">
                                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                                            </td>

                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => onViewDetails(u)}
                                                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 font-medium text-xs flex items-center gap-1 transition-colors"
                                                    >
                                                        <Eye size={12} /> Details
                                                    </button>

                                                    {isSelf ? (
                                                        <span className="text-[10px] text-slate-500 italic px-2">Primary Admin</span>
                                                    ) : (
                                                        <>
                                                            {!isApproved && (
                                                                <button
                                                                    onClick={() => onOpenApprove(u)}
                                                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-xs transition-colors"
                                                                >
                                                                    Approve
                                                                </button>
                                                            )}

                                                            {isPending && (
                                                                <button
                                                                    onClick={() => onOpenReject(u)}
                                                                    className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold text-xs transition-colors"
                                                                >
                                                                    Reject
                                                                </button>
                                                            )}

                                                            {isSuspended ? (
                                                                <button
                                                                    onClick={() => onOpenReactivate(u)}
                                                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-xs transition-colors"
                                                                >
                                                                    Reactivate
                                                                </button>
                                                            ) : (
                                                                isApproved && (
                                                                    <button
                                                                        onClick={() => onOpenSuspend(u)}
                                                                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1 transition-colors"
                                                                    >
                                                                        <AlertOctagon size={12} /> Suspend
                                                                    </button>
                                                                )
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Toolbar */}
                {total > 0 && (
                    <div className="p-4 border-t border-white/5 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>Rows per page:</span>
                            <select
                                value={limit}
                                onChange={(e) => onFilterChange("limit", parseInt(e.target.value, 10))}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-white outline-none cursor-pointer"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                            <span className="text-slate-500">
                                Page {page} of {totalPages} ({total} users)
                            </span>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => onPageChange(page - 1)}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white disabled:opacity-30 hover:bg-white/10 transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="px-3 py-1 font-semibold text-white">
                                {page}
                            </span>
                            <button
                                onClick={() => onPageChange(page + 1)}
                                disabled={page >= totalPages}
                                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white disabled:opacity-30 hover:bg-white/10 transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Audit History Section (Part E) ──────────────────────────────────────────

function AuditHistorySection({
    auditData,
    loading,
    filters,
    onFilterChange,
    onPageChange,
    onRefresh,
}) {
    const { logs = [], pagination = {} } = auditData || {};
    const { total = 0, page = 1, totalPages = 1 } = pagination;

    const actionColors = {
        USER_APPROVED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        USER_REJECTED: "bg-red-500/20 text-red-300 border-red-500/30",
        USER_SUSPENDED: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        USER_REACTIVATED: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="text-cyan-400" size={24} />
                        Administrative Audit Trail
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">
                        Immutable server-recorded log of all administrative decisions, status modifications, and reasons.
                    </p>
                </div>
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            {/* Audit Filters */}
            <div className="p-4 rounded-3xl bg-slate-900/60 border border-white/10 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search logs by target user, email, admin, or UID..."
                        value={filters.search}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="w-full pl-11 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 text-xs"
                    />
                </div>
                <select
                    value={filters.action}
                    onChange={(e) => onFilterChange("action", e.target.value)}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-white outline-none text-xs"
                >
                    <option value="all">All Actions</option>
                    <option value="USER_APPROVED">User Approved</option>
                    <option value="USER_REJECTED">User Rejected</option>
                    <option value="USER_SUSPENDED">User Suspended</option>
                    <option value="USER_REACTIVATED">User Reactivated</option>
                </select>
            </div>

            {/* Audit Cards List */}
            {logs.length === 0 ? (
                <div className="py-20 text-center rounded-3xl border border-white/10 bg-slate-900/60 space-y-2">
                    <Clock size={36} className="text-slate-600 mx-auto" />
                    <h4 className="text-base font-bold text-white">No Audit Events</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        No administrative operations match the selected criteria.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {logs.map((log) => (
                        <div
                            key={log.id}
                            className="p-5 rounded-3xl border border-white/10 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-white/20"
                        >
                            <div className="flex items-start gap-3.5">
                                <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 mt-0.5 shrink-0">
                                    <Activity size={18} />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                            actionColors[log.action] || "bg-white/10 text-slate-300 border-white/15"
                                        }`}>
                                            {log.action}
                                        </span>
                                        <span className="text-xs font-semibold text-white">
                                            {log.targetUserEmail || log.targetUserName || log.targetUserId}
                                        </span>
                                        {log.targetUserRole && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 capitalize">
                                                {log.targetUserRole}
                                            </span>
                                        )}
                                    </div>

                                    {log.reason && (
                                        <p className="text-xs text-amber-300/90 italic mt-1 bg-amber-500/5 px-3 py-1.5 rounded-xl border border-amber-500/10">
                                            Reason: &ldquo;{log.reason}&rdquo;
                                        </p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-0.5">
                                        <span>Target UID: <code className="text-slate-400">{log.targetUserId}</code></span>
                                        <span>Admin: <code className="text-cyan-400">{log.adminEmail || log.adminId}</code></span>
                                    </div>
                                </div>
                            </div>

                            <span className="text-xs text-slate-400 font-mono self-start sm:self-center shrink-0">
                                {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {total > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between text-xs text-slate-400">
                    <span>
                        Page {page} of {totalPages} ({total} audit events)
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white disabled:opacity-30 hover:bg-white/10"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 font-semibold text-white">{page}</span>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white disabled:opacity-30 hover:bg-white/10"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Confirmation Modals ──────────────────────────────────────────────────────

function ApproveConfirmModal({ user, onClose, onConfirm }) {
    const [submitting, setSubmitting] = useState(false);

    const handleApprove = async () => {
        setSubmitting(true);
        try {
            await onConfirm(user.id);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-emerald-500/30 p-8 shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Approve Registration</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        Grant dashboard access to <span className="text-white font-semibold">{user.email}</span> as a <span className="text-cyan-300 font-semibold capitalize">{user.role}</span>.
                    </p>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs disabled:opacity-50 shadow-md shadow-emerald-500/20"
                    >
                        {submitting ? "Approving..." : "Confirm Approval"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ReactivateConfirmModal({ user, onClose, onConfirm }) {
    const [submitting, setSubmitting] = useState(false);

    const handleReactivate = async () => {
        setSubmitting(true);
        try {
            await onConfirm(user.id);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-cyan-500/30 p-8 shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <RefreshCw size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Reactivate Account</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        Restore dashboard access for <span className="text-white font-semibold">{user.email}</span>.
                    </p>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleReactivate}
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-xs disabled:opacity-50 shadow-md shadow-cyan-500/20"
                    >
                        {submitting ? "Reactivating..." : "Confirm Reactivation"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RejectionModal({ user, onClose, onConfirm }) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason.trim()) {
            toast.error("Please enter a rejection reason.");
            return;
        }
        setSubmitting(true);
        try {
            await onConfirm(user.id, reason);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-red-500/30 p-8 shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center">
                    <UserX size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Reject Registration</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        Rejecting <span className="text-white font-medium">{user.email}</span>. A reason is required and will be displayed to the user.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <textarea
                        rows={3}
                        placeholder="State reason for rejection (e.g., Incomplete identity verification, invalid institutional email)..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none text-xs resize-none focus:border-red-400"
                        required
                    />
                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs disabled:opacity-50"
                        >
                            {submitting ? "Rejecting..." : "Confirm Rejection"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SuspensionModal({ user, onClose, onConfirm }) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason.trim()) {
            toast.error("Please enter a suspension reason.");
            return;
        }
        setSubmitting(true);
        try {
            await onConfirm(user.id, reason);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-500/30 p-8 shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <AlertOctagon size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Suspend Account</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        Suspending <span className="text-white font-medium">{user.email}</span> will block access to their dashboard until reactivated.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <textarea
                        rows={3}
                        placeholder="State reason for suspension..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none text-xs resize-none focus:border-amber-400"
                        required
                    />
                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs disabled:opacity-50"
                        >
                            {submitting ? "Suspending..." : "Confirm Suspension"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main SuperAdminDashboard Component ──────────────────────────────────────

export default function SuperAdminDashboard() {
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState("overview");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Platform State
    const [overviewData, setOverviewData] = useState(null);
    const [loadingOverview, setLoadingOverview] = useState(true);

    // Analytics State
    const [selectedRange, setSelectedRange] = useState("30d");
    const [analyticsData, setAnalyticsData] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);

    // Users Management State
    const [usersData, setUsersData] = useState({ users: [], pagination: {} });
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [userFilters, setUserFilters] = useState({
        search: "",
        role: "all",
        approvalStatus: "all",
        accountStatus: "all",
        sortBy: "createdAt",
        sortOrder: "desc",
        page: 1,
        limit: 10,
        cursor: null,
    });
    const [cursorMap, setCursorMap] = useState({ 1: null });

    // Audit Logs State
    const [auditData, setAuditData] = useState({ logs: [], pagination: {} });
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [auditFilters, setAuditFilters] = useState({
        action: "all",
        search: "",
        page: 1,
        limit: 10,
    });

    // Modals
    const [selectedDetailUser, setSelectedDetailUser] = useState(null);
    const [approveModalUser, setApproveModalUser] = useState(null);
    const [rejectModalUser, setRejectModalUser] = useState(null);
    const [suspendModalUser, setSuspendModalUser] = useState(null);
    const [reactivateModalUser, setReactivateModalUser] = useState(null);

    // ── Loaders (For manual refresh and action handlers) ─────────────────────

    // 1. Overview Refresh
    const refreshOverview = useCallback(async () => {
        setLoadingOverview(true);
        try {
            const data = await fetchPlatformOverview();
            if (data) setOverviewData(data);
        } catch {
            toast.error("Failed to load platform overview.");
        } finally {
            setLoadingOverview(false);
        }
    }, []);

    // 2. Users Refresh
    const refreshUsers = useCallback(async (filters) => {
        setLoadingUsers(true);
        try {
            const res = await fetchUsersPaginated(filters || userFilters);
            if (res) setUsersData(res);
        } catch {
            toast.error("Failed to load user directory.");
        } finally {
            setLoadingUsers(false);
        }
    }, [userFilters]);

    // 3. Audit Logs Refresh
    const refreshAuditLogs = useCallback(async (filters) => {
        setLoadingAudit(true);
        try {
            const res = await fetchAuditLogsPaginated(filters || auditFilters);
            if (res) setAuditData(res);
        } catch {
            toast.error("Failed to load audit logs.");
        } finally {
            setLoadingAudit(false);
        }
    }, [auditFilters]);

    // Initial Load: Overview Sync (without synchronous setState in effect)
    useEffect(() => {
        let isCurrent = true;

        fetchPlatformOverview()
            .then((data) => {
                if (!isCurrent) return;
                if (data) setOverviewData(data);
            })
            .catch(() => {
                if (!isCurrent) return;
                toast.error("Failed to load platform overview.");
            })
            .finally(() => {
                if (isCurrent) {
                    setLoadingOverview(false);
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [user]);

    // Section Data Sync (Analytics, Users / Approvals, Audit Logs)
    useEffect(() => {
        let isCurrent = true;

        if (activeSection === "analytics") {
            fetchPlatformAnalytics(selectedRange)
                .then((data) => {
                    if (!isCurrent) return;
                    if (data) setAnalyticsData(data);
                })
                .catch(() => {
                    if (!isCurrent) return;
                    toast.error("Failed to load platform analytics.");
                })
                .finally(() => {
                    if (isCurrent) setLoadingAnalytics(false);
                });
        } else if (activeSection === "users" || activeSection === "approvals" || activeSection === "overview") {
            fetchUsersPaginated(userFilters)
                .then((res) => {
                    if (!isCurrent) return;
                    if (res) setUsersData(res);
                })
                .catch(() => {
                    if (!isCurrent) return;
                    toast.error("Failed to load user directory.");
                })
                .finally(() => {
                    if (isCurrent) setLoadingUsers(false);
                });
        } else if (activeSection === "logs") {
            fetchAuditLogsPaginated(auditFilters)
                .then((res) => {
                    if (!isCurrent) return;
                    if (res) setAuditData(res);
                })
                .catch(() => {
                    if (!isCurrent) return;
                    toast.error("Failed to load audit logs.");
                })
                .finally(() => {
                    if (isCurrent) setLoadingAudit(false);
                });
        }

        return () => {
            isCurrent = false;
        };
    }, [activeSection, selectedRange, userFilters, auditFilters]);

    const handleSectionChange = (newSection) => {
        if (newSection === activeSection) return;
        if (newSection === "analytics") {
            setLoadingAnalytics(true);
        } else if (newSection === "users" || newSection === "approvals" || newSection === "overview") {
            setLoadingUsers(true);
        } else if (newSection === "logs") {
            setLoadingAudit(true);
        }
        setActiveSection(newSection);
    };

    const handleRangeChange = (range) => {
        setLoadingAnalytics(true);
        setSelectedRange(range);
    };

    const handleUserFilterChange = (key, value) => {
        setLoadingUsers(true);
        setCursorMap({ 1: null });
        setUserFilters((prev) => ({
            ...prev,
            [key]: value,
            page: 1,
            cursor: null,
        }));
    };

    const handleUserPageChange = (newPage) => {
        if (newPage === userFilters.page || newPage < 1) return;
        setLoadingUsers(true);
        let targetCursor = null;

        if (newPage === 1) {
            targetCursor = null;
        } else if (newPage > userFilters.page) {
            targetCursor = usersData?.pagination?.nextCursor || null;
            setCursorMap((prev) => ({ ...prev, [newPage]: targetCursor }));
        } else {
            targetCursor = cursorMap[newPage] || null;
        }

        setUserFilters((prev) => ({
            ...prev,
            page: newPage,
            cursor: targetCursor,
        }));
    };

    const handleAuditFilterChange = (key, value) => {
        setLoadingAudit(true);
        setAuditFilters((prev) => ({
            ...prev,
            [key]: value,
            page: key === "search" || key === "action" ? 1 : prev.page,
        }));
    };

    // ── Action Handlers ─────────────────────────────────────────────────────

    const handleConfirmApprove = async (userId) => {
        try {
            await approveUser(userId);
            toast.success("User registration approved!");
            await refreshOverview();
            await refreshUsers();
        } catch (err) {
            toast.error(err.message || "Failed to approve user.");
        }
    };

    const handleConfirmReject = async (userId, reason) => {
        try {
            await rejectUser(userId, reason);
            toast.success("User registration rejected.");
            await refreshOverview();
            await refreshUsers();
        } catch (err) {
            toast.error(err.message || "Failed to reject user.");
        }
    };

    const handleConfirmSuspend = async (userId, reason) => {
        try {
            await suspendUser(userId, reason);
            toast.success("User account suspended.");
            await refreshOverview();
            await refreshUsers();
        } catch (err) {
            toast.error(err.message || "Failed to suspend user.");
        }
    };

    const handleConfirmReactivate = async (userId) => {
        try {
            await reactivateUser(userId);
            toast.success("User account reactivated!");
            await refreshOverview();
            await refreshUsers();
        } catch (err) {
            toast.error(err.message || "Failed to reactivate user.");
        }
    };

    const handleOpenInfoModal = (u) => {
        window.location.href = `mailto:${u.email}?subject=DyslexAid Registration Verification Inquiry&body=Hello ${u.name || ""},%0D%0A%0D%0ARegarding your DyslexAid registration as a ${u.role}:`;
    };

    const pendingCount = overviewData?.pendingApprovals ?? (
        usersData.users.filter((u) => (u.approvalStatus || "pending") === "pending").length
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col">
            <AdminSidebar
                activeSection={activeSection}
                onSectionChange={handleSectionChange}
                isMobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
                pendingCount={pendingCount}
            />

            <div className="lg:ml-64 flex flex-col min-h-screen">
                <AdminNavbar
                    activeSection={activeSection}
                    onMobileMenuOpen={() => setMobileMenuOpen(true)}
                />

                <main className="flex-1 p-6 lg:p-8 overflow-auto">
                    {activeSection === "overview" && (
                        <OverviewSection
                            overviewData={overviewData}
                            loadingOverview={loadingOverview}
                            pendingCount={pendingCount}
                            onNavigateApprovals={() => handleSectionChange("approvals")}
                            onNavigateUsers={() => handleSectionChange("users")}
                            onNavigateAnalytics={() => handleSectionChange("analytics")}
                            onNavigateMonitoring={() => handleSectionChange("monitoring")}
                        />
                    )}

                    {activeSection === "approvals" && (
                        <ApprovalsSection
                            users={usersData.users}
                            loading={loadingUsers}
                            onRefresh={() => refreshUsers(userFilters)}
                            onOpenApprove={(u) => setApproveModalUser(u)}
                            onOpenReject={(u) => setRejectModalUser(u)}
                            onOpenInfoModal={handleOpenInfoModal}
                            onViewDetails={(u) => setSelectedDetailUser(u)}
                        />
                    )}

                    {activeSection === "users" && (
                        <AllUsersSection
                            usersData={usersData}
                            loading={loadingUsers}
                            filters={userFilters}
                            onFilterChange={handleUserFilterChange}
                            onPageChange={handleUserPageChange}
                            onRefresh={() => refreshUsers(userFilters)}
                            onViewDetails={(u) => setSelectedDetailUser(u)}
                            onOpenApprove={(u) => setApproveModalUser(u)}
                            onOpenReject={(u) => setRejectModalUser(u)}
                            onOpenSuspend={(u) => setSuspendModalUser(u)}
                            onOpenReactivate={(u) => setReactivateModalUser(u)}
                            currentAdminUid={user?.uid}
                        />
                    )}

                    {activeSection === "analytics" && (
                        <AnalyticsVisualizer
                            analyticsData={analyticsData}
                            loading={loadingAnalytics}
                            selectedRange={selectedRange}
                            onRangeChange={handleRangeChange}
                        />
                    )}

                    {activeSection === "monitoring" && (
                        <SystemHealthMonitor />
                    )}

                    {activeSection === "logs" && (
                        <AuditHistorySection
                            auditData={auditData}
                            loading={loadingAudit}
                            filters={auditFilters}
                            onFilterChange={handleAuditFilterChange}
                            onPageChange={(p) => setAuditFilters((prev) => ({ ...prev, page: p }))}
                            onRefresh={() => refreshAuditLogs(auditFilters)}
                        />
                    )}

                    {activeSection === "settings" && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <ShieldCheck className="text-cyan-400" size={24} />
                                Super Admin System Policy & Configuration
                            </h2>
                            <div className="p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck size={28} className="text-cyan-400" />
                                    <div>
                                        <h3 className="font-bold text-white text-base">Singleton Primary Super Admin Policy</h3>
                                        <p className="text-xs text-slate-400">
                                            Platform security policy enforces exactly ONE authorized primary Super Admin account.
                                        </p>
                                    </div>
                                </div>
                                <div className="text-xs text-slate-300 space-y-2 bg-slate-950/70 p-5 rounded-2xl border border-white/5 font-mono">
                                    <p>• Administrator UID: <span className="text-cyan-300">{user?.uid}</span></p>
                                    <p>• Verified Admin Email: <span className="text-cyan-300">{user?.email}</span></p>
                                    <p>• Token Custom Claim: <span className="text-emerald-400">&#123; superadmin: true &#125;</span> (Verified via Firebase Admin SDK)</p>
                                    <p>• Centralized Approval Workflow: <span className="text-emerald-400">Phase 3 &amp; 4 Active</span></p>
                                    <p>• Server Security Sentinel: <span className="text-purple-300">admin_config/primary</span></p>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Modals */}
            {selectedDetailUser && (
                <UserDetailsModal
                    user={selectedDetailUser}
                    onClose={() => setSelectedDetailUser(null)}
                    onApprove={(uid) => handleConfirmApprove(uid)}
                    onOpenReject={(u) => setRejectModalUser(u)}
                    onOpenSuspend={(u) => setSuspendModalUser(u)}
                    onReactivate={(uid) => handleConfirmReactivate(uid)}
                    currentAdminUid={user?.uid}
                />
            )}

            {approveModalUser && (
                <ApproveConfirmModal
                    user={approveModalUser}
                    onClose={() => setApproveModalUser(null)}
                    onConfirm={handleConfirmApprove}
                />
            )}

            {rejectModalUser && (
                <RejectionModal
                    user={rejectModalUser}
                    onClose={() => setRejectModalUser(null)}
                    onConfirm={handleConfirmReject}
                />
            )}

            {suspendModalUser && (
                <SuspensionModal
                    user={suspendModalUser}
                    onClose={() => setSuspendModalUser(null)}
                    onConfirm={handleConfirmSuspend}
                />
            )}

            {reactivateModalUser && (
                <ReactivateConfirmModal
                    user={reactivateModalUser}
                    onClose={() => setReactivateModalUser(null)}
                    onConfirm={handleConfirmReactivate}
                />
            )}
        </div>
    );
}
