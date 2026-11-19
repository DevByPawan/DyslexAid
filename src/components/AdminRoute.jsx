import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";

/**
 * AdminRoute
 * ----------
 * Guards the Super Admin dashboard.
 *
 * Authorization is based SOLELY on the Firebase Auth ID token custom claim
 * { superadmin: true }, which is set server-side by the provisioning script.
 * The Firestore "role" field is intentionally NOT used here as the authority –
 * any client could theoretically write to their own Firestore document.
 *
 * Access matrix:
 *   - loading           → spinner (auth state not yet resolved)
 *   - unauthenticated   → redirect to /login
 *   - authenticated, no superadmin claim → redirect to role home + toast
 *   - authenticated + superadmin claim → render children
 */
export default function AdminRoute({ children }) {
    const { user, role, isSuperAdmin, loading } = useAuth();

    // Compute unauthorized state: authenticated but missing the claim
    const isUnauthorized = !loading && user && !isSuperAdmin;

    useEffect(() => {
        if (isUnauthorized) {
            toast.error("Admin access denied.", {
                id: "admin-access-denied",
            });
        }
    }, [isUnauthorized]);

    // 1. Auth state still resolving (token + claim read in progress)
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

    // 2. Not signed in at all
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 3. Signed in but no superadmin custom claim → redirect to role home
    if (!isSuperAdmin) {
        if (role === "teacher") return <Navigate to="/teacher-dashboard" replace />;
        if (role === "parent")  return <Navigate to="/parent-dashboard" replace />;
        if (role === "student") return <Navigate to="/dashboard" replace />;
        // Unknown role or missing profile
        return <Navigate to="/" replace />;
    }

    // 4. Verified Super Admin
    return children;
}

