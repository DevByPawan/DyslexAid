import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, RefreshCw, LogOut, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";

export default function PendingApproval() {
    const { user, userProfile, role, isSuperAdmin, logout, refreshUserProfile } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const navigate = useNavigate();

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const profile = await refreshUserProfile();
            if (profile?.approvalStatus === "approved" || isSuperAdmin) {
                toast.success("Congratulations! Your account has been approved.");
                if (role === "teacher") {
                    navigate("/teacher-dashboard");
                } else if (role === "parent") {
                    navigate("/parent-dashboard");
                } else {
                    navigate("/dashboard");
                }
            } else if (profile?.approvalStatus === "rejected") {
                toast.error("Your registration was not approved.");
                navigate("/account-rejected");
            } else if (profile?.accountStatus === "suspended") {
                navigate("/account-suspended");
            } else {
                toast("Your account is still pending Super Admin review.", {
                    icon: "⏳",
                });
            }
        } catch {
            toast.error("Failed to refresh status. Please try again.");
        } finally {
            setRefreshing(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            toast.success("Logged out successfully");
            navigate("/login");
        } catch {
            toast.error("Error during logout");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 px-6 py-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/10 blur-3xl rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="w-full max-w-lg backdrop-blur-2xl bg-white/[0.08] border border-white/15 rounded-[36px] p-8 md:p-10 shadow-2xl text-center relative z-10">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-6">
                    <Clock size={40} className="text-amber-400 animate-pulse" />
                </div>

                <div className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-4">
                    Account Status: Pending Approval
                </div>

                <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    Registration Submitted
                </h1>

                <p className="text-gray-300 text-base mb-6 leading-relaxed">
                    Welcome to <span className="font-semibold text-cyan-300">DyslexAid</span>,{" "}
                    <span className="text-white font-medium">{userProfile?.name || user?.email}</span>!
                    All new accounts require review and approval by the platform Super Admin before accessing protected learning dashboards.
                </p>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-left space-y-2 text-sm text-gray-300">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Registered Email:</span>
                        <span className="font-medium text-white truncate max-w-[220px]">
                            {user?.email || "—"}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Requested Role:</span>
                        <span className="font-semibold capitalize text-cyan-300">
                            {userProfile?.role || role || "Student"}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Review SLA:</span>
                        <span className="text-white">Within 24–48 hours</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-pink-400 text-black font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                        {refreshing ? "Checking Status..." : "Check Approval Status"}
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center justify-center gap-2 transition-all"
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </div>

                <p className="mt-6 text-xs text-gray-500 flex items-center justify-center gap-1.5">
                    <ShieldAlert size={14} className="text-cyan-400" />
                    DyslexAid Protected Centralized Super Admin Gateway
                </p>
            </div>
        </div>
    );
}

