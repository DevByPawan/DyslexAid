import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({ children, allowedRoles }) {
    const { user, userProfile, role, isSuperAdmin, loading } = useAuth();

    const approvalStatus = userProfile?.approvalStatus;
    const accountStatus = userProfile?.accountStatus;

    // Check if unauthorized role for approved users
    const isUnauthorizedRole = Boolean(
        !loading &&
        user &&
        !isSuperAdmin &&
        approvalStatus !== "pending" &&
        approvalStatus !== "rejected" &&
        accountStatus !== "suspended" &&
        allowedRoles &&
        allowedRoles.length > 0 &&
        (!role || !allowedRoles.includes(role))
    );

    useEffect(() => {
        if (isUnauthorizedRole) {
            toast.error("Unauthorized access for your account role", {
                id: "unauthorized-role-toast",
            });
        }
    }, [isUnauthorizedRole]);

    // 1. Loading state during auth restoration
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h2 className="text-white text-xl font-semibold">
                        Loading DyslexAid...
                    </h2>
                </div>
            </div>
        );
    }

    // 2. Redirect unauthenticated users to /login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 3. Super Admin bypasses student/teacher/parent route restrictions
    if (isSuperAdmin) {
        return children;
    }

    // 4. Status-based route gating (Mandatory approval system)
    if (accountStatus === "suspended") {
        return <Navigate to="/account-suspended" replace />;
    }

    if (approvalStatus === "rejected") {
        return <Navigate to="/account-rejected" replace />;
    }

    if (approvalStatus === "pending") {
        return <Navigate to="/pending-approval" replace />;
    }

    // 5. Role verification for approved users
    if (allowedRoles && allowedRoles.length > 0) {
        if (!role || !allowedRoles.includes(role)) {
            if (role === "teacher") {
                return <Navigate to="/teacher-dashboard" replace />;
            }
            if (role === "parent") {
                return <Navigate to="/parent-dashboard" replace />;
            }
            if (role === "student") {
                return <Navigate to="/dashboard" replace />;
            }
            return <Navigate to="/login" replace />;
        }
    }

    return children;
}
