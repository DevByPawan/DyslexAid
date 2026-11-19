import { Menu, Bell, ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

export default function AdminNavbar({ activeSection, onMobileMenuOpen }) {
    const { user, userProfile, logout } = useAuth();
    const navigate = useNavigate();

    const sectionTitles = {
        overview:  "Overview",
        approvals: "User Approvals",
        users:     "All Users",
        analytics: "Analytics",
        logs:      "Activity Logs",
        settings:  "Settings",
    };

    const handleLogout = async () => {
        try {
            await logout();
            toast.success("Logged out successfully");
            navigate("/");
        } catch {
            toast.error("Logout failed. Please try again.");
        }
    };

    return (
        <header className="
            sticky top-0 z-10
            flex items-center justify-between
            px-6 py-4
            bg-slate-950/80 backdrop-blur-2xl
            border-b border-white/10
        ">
            {/* Left: mobile menu + page title */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onMobileMenuOpen}
                    className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <Menu size={20} />
                </button>

                <div>
                    <h1 className="text-xl font-bold text-white">
                        {sectionTitles[activeSection] || "Dashboard"}
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                        DyslexAid Administration
                    </p>
                </div>
            </div>

            {/* Right: notifications + admin badge + logout */}
            <div className="flex items-center gap-3">
                {/* Notification bell – functional in Phase 3 */}
                <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                    <Bell size={18} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400"></span>
                </button>

                {/* Admin identity badge */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-pink-400 flex items-center justify-center">
                        <ShieldCheck size={14} className="text-black" />
                    </div>
                    <div className="text-sm">
                        <p className="text-white font-medium leading-none">
                            {userProfile?.name || "Super Admin"}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5 leading-none">
                            {user?.email}
                        </p>
                    </div>
                </div>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 hover:border-red-400/30 transition-all duration-200"
                >
                    <LogOut size={15} />
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>
        </header>
    );
}

