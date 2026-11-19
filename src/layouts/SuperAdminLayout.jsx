import { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminNavbar from "../components/admin/AdminNavbar";

export default function SuperAdminLayout({ activeSection, onSectionChange }) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
            {/* Sidebar */}
            <AdminSidebar
                activeSection={activeSection}
                onSectionChange={onSectionChange}
                isMobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
            />

            {/* Main content area – offset by sidebar width on large screens */}
            <div className="lg:ml-64 flex flex-col min-h-screen">
                {/* Top navbar */}
                <AdminNavbar
                    activeSection={activeSection}
                    onMobileMenuOpen={() => setMobileMenuOpen(true)}
                />

                {/* Page content */}
                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

