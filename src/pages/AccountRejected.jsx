import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { XCircle, RefreshCw, LogOut, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";

export default function AccountRejected() {
    const { user, userProfile, role, logout, refreshUserProfile } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const navigate = useNavigate();

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const profile = await refreshUserProfile();
            if (profile?.approvalStatus === "approved") {
                toast.success("Your account is now approved!");
                if (role === "teacher") {
                    navigate("/teacher-dashboard");
                } else if (role === "parent") {
                    navigate("/parent-dashboard");
                } else {
                    navigate("/dashboard");
                }
            } else if (profile?.approvalStatus === "pending") {
                navigate("/pending-approval");
            } else {
                toast("Status unchanged: Account registration was not approved.", {
                    icon: "ℹ️",
                });
            }
        } catch {
            toast.error("Failed to check status. Try again.");
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

    const rejectionReason =
        userProfile?.rejectionReason ||
        "The application did not satisfy registration requirements or incomplete information was provided.";

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 px-6 py-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-96 h-96 bg-red-500/10 blur-3xl rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="w-full max-w-lg backdrop-blur-2xl bg-white/[0.08] border border-red-500/20 rounded-[36px] p-8 md:p-10 shadow-2xl text-center relative z-10">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-6">
                    <XCircle size={40} className="text-red-400" />
                </div>

                <div className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30 mb-4">
                    Account Status: Not Approved
                </div>

                <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    Registration Declined
                </h1>

                <p className="text-gray-300 text-base mb-6 leading-relaxed">
                    Thank you for your interest in DyslexAid. After administrative review, your registration request for{" "}
                    <span className="text-white font-medium">{user?.email}</span> was declined.
                </p>

                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 mb-8 text-left space-y-2 text-sm">
                    <span className="text-red-300 font-semibold block">Reason for Decision:</span>
                    <p className="text-gray-200 leading-relaxed">{rejectionReason}</p>
                </div>

                <div className="space-y-3">
                    <a
                        href="mailto:support@dyslexaid.com?subject=DyslexAid Registration Appeal"
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-pink-400 text-black font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all"
                    >
                        <Mail size={18} />
                        Contact Administration / Appeal
                    </a>

                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium flex items-center justify-center gap-2 transition-all"
                    >
                        <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                        {refreshing ? "Checking..." : "Re-check Status"}
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full py-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-medium flex items-center justify-center gap-2 transition-all"
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
}

