import {
    LayoutDashboard,
    UserCheck,
    Users,
    BarChart3,
    ScrollText,
    Settings,
    ShieldCheck,
    Activity,
    X,
} from "lucide-react";

const NAV_ITEMS = [
    {
        label: "Overview",
        icon: LayoutDashboard,
        section: "overview",
    },
    {
        label: "User Approvals",
        icon: UserCheck,
        section: "approvals",
    },
    {
        label: "All Users",
        icon: Users,
        section: "users",
    },
    {
        label: "Analytics",
        icon: BarChart3,
        section: "analytics",
    },
    {
        label: "System Health",
        icon: Activity,
        section: "monitoring",
    },
    {
        label: "Activity Logs",
        icon: ScrollText,
        section: "logs",
    },
    {
        label: "Settings",
        icon: Settings,
        section: "settings",
    },
];

export default function AdminSidebar({
    activeSection,
    onSectionChange,
    isMobileOpen,
    onMobileClose,
    pendingCount = 0,
}) {
    return (
        <>
            {/* Mobile backdrop */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-20 lg:hidden"
                    onClick={onMobileClose}
                />
            )}

            {/* Sidebar panel */}
            <aside
                className={`
                    fixed top-0 left-0 h-full w-64 z-30
                    bg-slate-950/95 backdrop-blur-2xl
                    border-r border-white/10
                    flex flex-col
                    transition-transform duration-300 ease-in-out
                    ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                {/* Logo / Brand */}
                <div className="flex items-center justify-between px-6 py-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-pink-400 flex items-center justify-center">
                            <ShieldCheck size={18} className="text-black" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg leading-none">
                                Dyslex<span className="text-cyan-400">Aid</span>
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">Admin Panel</p>
                        </div>
                    </div>
                    {/* Mobile close */}
                    <button
                        className="lg:hidden text-slate-400 hover:text-white transition-colors"
                        onClick={onMobileClose}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                    {NAV_ITEMS.map(({ label, icon: Icon, section }) => {
                        const isActive = activeSection === section;
                        return (
                            <button
                                key={section}
                                onClick={() => {
                                    onSectionChange(section);
                                    onMobileClose();
                                }}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 rounded-xl
                                    text-sm font-medium transition-all duration-200
                                    ${isActive
                                        ? "bg-gradient-to-r from-cyan-500/20 to-pink-500/10 text-white border border-cyan-500/30"
                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                    }
                                `}
                            >
                                <Icon
                                    size={18}
                                    className={isActive ? "text-cyan-400" : ""}
                                />
                                {label}
                                {section === "approvals" && pendingCount > 0 && (
                                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse">
                                        {pendingCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/10">
                    <p className="text-xs text-slate-500 text-center">
                        DyslexAid Super Admin
                    </p>
                    <p className="text-xs text-cyan-400/80 text-center mt-1">
                        Phase 3 — Approvals Active
                    </p>
                </div>
            </aside>
        </>
    );
}
