import { auth, db } from "../firebase";
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
} from "firebase/firestore";
import toast from "react-hot-toast";

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || "http://localhost:3001/api/admin";

/**
 * Get the current Super Admin's ID token.
 */
async function getIdToken() {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("No authenticated user.");
    return await currentUser.getIdToken();
}

/**
 * Execute an administrative operation against the trusted backend.
 * Hardened: ZERO client-side Firestore fallbacks.
 * If backend is unavailable or unauthorized, surfaces a clear toast error and throws.
 */
async function callAdminApi(endpoint, body = {}) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        const msg = "Unauthorized: You must be logged in as Super Admin.";
        toast.error(msg);
        throw new Error(msg);
    }

    let token;
    try {
        token = await getIdToken();
    } catch {
        const msg = "Failed to retrieve authentication token.";
        toast.error(msg);
        throw new Error(msg);
    }

    let res;
    try {
        res = await fetch(`${ADMIN_API_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
    } catch {
        const errorMsg = "Admin backend service is unavailable. Please ensure the server is running on port 3001.";
        toast.error(errorMsg);
        throw new Error(errorMsg);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const errorMsg = data.error || `Admin operation failed (${res.status}).`;
        toast.error(errorMsg);
        throw new Error(errorMsg);
    }

    return data;
}

/**
 * Approve a user registration.
 * STRICT: Backend authorization only. No client Firestore fallback.
 */
export async function approveUser(userId) {
    if (!userId) throw new Error("userId is required.");
    const currentUser = auth.currentUser;
    if (userId === currentUser?.uid) {
        const msg = "Self-approval is strictly forbidden.";
        toast.error(msg);
        throw new Error(msg);
    }

    return await callAdminApi("/approve", { userId });
}

/**
 * Reject a user registration.
 * STRICT: Backend authorization only. No client Firestore fallback.
 */
export async function rejectUser(userId, reason) {
    if (!userId) throw new Error("userId is required.");
    if (!reason || !reason.trim()) {
        const msg = "A rejection reason is required.";
        toast.error(msg);
        throw new Error(msg);
    }
    const currentUser = auth.currentUser;
    if (userId === currentUser?.uid) {
        const msg = "Cannot reject your own account.";
        toast.error(msg);
        throw new Error(msg);
    }

    return await callAdminApi("/reject", { userId, reason: reason.trim() });
}

/**
 * Suspend an approved user.
 * STRICT: Backend authorization only. No client Firestore fallback.
 */
export async function suspendUser(userId, reason) {
    if (!userId) throw new Error("userId is required.");
    if (!reason || !reason.trim()) {
        const msg = "A suspension reason is required.";
        toast.error(msg);
        throw new Error(msg);
    }
    const currentUser = auth.currentUser;
    if (userId === currentUser?.uid) {
        const msg = "Cannot suspend your own account.";
        toast.error(msg);
        throw new Error(msg);
    }

    return await callAdminApi("/suspend", { userId, reason: reason.trim() });
}

/**
 * Reactivate a suspended user.
 * STRICT: Backend authorization only. No client Firestore fallback.
 */
export async function reactivateUser(userId) {
    if (!userId) throw new Error("userId is required.");
    const currentUser = auth.currentUser;
    if (userId === currentUser?.uid) {
        const msg = "Cannot modify your own account.";
        toast.error(msg);
        throw new Error(msg);
    }

    return await callAdminApi("/reactivate", { userId });
}

/**
 * Fetch high-level platform overview metrics.
 */
export async function fetchPlatformOverview() {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/overview`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch (err) {
        console.error("fetchPlatformOverview error:", err);
    }
    return null;
}

/**
 * Fetch detailed platform analytics, trend timelines, and assessment breakdowns.
 * @param {string} range - '7d' | '30d' | '90d' | 'all'
 */
export async function fetchPlatformAnalytics(range = "30d") {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/analytics?range=${encodeURIComponent(range)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch (err) {
        console.error("fetchPlatformAnalytics error:", err);
    }
    return null;
}

/**
 * Fetch paginated, filtered, and sorted users from the backend API.
 */
export async function fetchUsersPaginated({
    search = "",
    role = "all",
    approvalStatus = "all",
    accountStatus = "all",
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
    cursor = null,
} = {}) {
    try {
        const token = await getIdToken();
        const paramObj = {
            search,
            role,
            approvalStatus,
            accountStatus,
            page: String(page),
            limit: String(limit),
            sortBy,
            sortOrder,
        };
        if (cursor) {
            paramObj.cursor = cursor;
        }
        const params = new URLSearchParams(paramObj);

        const res = await fetch(`${ADMIN_API_URL}/users?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
                // If response is { users: [...], pagination: {...} }
                if (json.data.users && json.data.pagination) {
                    return json.data;
                }
                // If array fallback
                if (Array.isArray(json.data)) {
                    return {
                        users: json.data,
                        pagination: {
                            total: json.data.length,
                            page: 1,
                            limit: json.data.length,
                            totalPages: 1,
                            hasNext: false,
                            hasPrev: false,
                        },
                    };
                }
            }
        }
    } catch (err) {
        console.error("fetchUsersPaginated error:", err);
    }
    return {
        users: [],
        pagination: { total: 0, page: 1, limit, totalPages: 1, hasNext: false, hasPrev: false },
    };
}

/**
 * Fetch detailed profile, student metrics, and audit history for a specific user.
 */
export async function fetchUserDetails(userId) {
    if (!userId) return null;
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/users/${encodeURIComponent(userId)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch (err) {
        console.error("fetchUserDetails error:", err);
    }
    return null;
}

/**
 * Fetch administrative audit logs with pagination and filters.
 */
export async function fetchAuditLogsPaginated({
    page = 1,
    limit = 10,
    action = "all",
    search = "",
} = {}) {
    try {
        const token = await getIdToken();
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            action,
            search,
        });
        const res = await fetch(`${ADMIN_API_URL}/audit-logs?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
                if (json.data.logs && json.data.pagination) {
                    return json.data;
                }
                if (Array.isArray(json.data)) {
                    return {
                        logs: json.data,
                        pagination: {
                            total: json.data.length,
                            page: 1,
                            limit: json.data.length,
                            totalPages: 1,
                            hasNext: false,
                            hasPrev: false,
                        },
                    };
                }
            }
        }
    } catch (err) {
        console.error("fetchAuditLogsPaginated error:", err);
    }
    return {
        logs: [],
        pagination: { total: 0, page: 1, limit, totalPages: 1, hasNext: false, hasPrev: false },
    };
}

/**
 * Fetch all pending approval requests.
 * Uses trusted backend API if available, falls back to direct query.
 */
export async function fetchPendingApprovals() {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/pending`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch {
        // Fallback to client query
    }

    try {
        const q = query(
            collection(db, "approvalRequests"),
            where("status", "==", "pending")
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("fetchPendingApprovals error:", err);
        return [];
    }
}

/**
 * Fetch all users from Firestore.
 */
export async function fetchAllUsersList() {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/users`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch {
        // Fallback to client query
    }

    try {
        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        return snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((u) => u.role !== "superadmin");
    } catch (err) {
        console.error("fetchAllUsersList error:", err);
        return [];
    }
}

/**
 * Fetch administrative audit logs from the trusted backend.
 * Protected by verifyAdmin (Super Admin only).
 * Client-side Firestore reads are prohibited by security rules (allow read: if false;).
 */
export async function fetchAuditLogs() {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/audit-logs`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) return json.data;
        }
    } catch (err) {
        console.error("fetchAuditLogs backend fetch error:", err);
    }
    return [];
}

/**
 * Fetch comprehensive system health status across all subsystems.
 * Protected by verifyAdmin.
 */
export async function fetchSystemHealth() {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/system/health`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch (err) {
        console.error("fetchSystemHealth error:", err);
    }
    return null;
}

/**
 * Fetch API performance metrics and response latency distribution.
 * Protected by verifyAdmin.
 */
export async function fetchSystemMetrics() {
    try {
        const token = await getIdToken();
        const res = await fetch(`${ADMIN_API_URL}/system/metrics`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch (err) {
        console.error("fetchSystemMetrics error:", err);
    }
    return null;
}

/**
 * Fetch recent platform incidents and error events.
 * Protected by verifyAdmin.
 */
export async function fetchSystemIncidents({ severity = "all", service = "all", limit = 50 } = {}) {
    try {
        const token = await getIdToken();
        const params = new URLSearchParams({ severity, service, limit: String(limit) });
        const res = await fetch(`${ADMIN_API_URL}/system/incidents?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) return json.data;
        }
    } catch (err) {
        console.error("fetchSystemIncidents error:", err);
    }
    return { total: 0, incidents: [] };
}

/**
 * Report a manual system alert or operational event.
 * Protected by verifyAdmin.
 */
export async function reportSystemIncident({ eventType, service, severity, message }) {
    return await callAdminApi("/system/incidents", { eventType, service, severity, message });
}

/**
 * Fetch paginated historical assessments with cursor pagination and multi-dimensional filters.
 * Protected by verifyAdmin.
 */
export async function fetchHistoricalAssessments({
    userId = null,
    risk = "all",
    startDate = null,
    endDate = null,
    limit = 10,
    cursor = null,
    sortOrder = "desc",
} = {}) {
    try {
        const token = await getIdToken();
        const paramObj = {
            risk,
            limit: String(limit),
            sortOrder,
        };
        if (userId) paramObj.userId = userId;
        if (startDate) paramObj.startDate = startDate;
        if (endDate) paramObj.endDate = endDate;
        if (cursor) paramObj.cursor = cursor;

        const params = new URLSearchParams(paramObj);
        const res = await fetch(`${ADMIN_API_URL}/assessments?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
                return json.data;
            }
        }
    } catch (err) {
        console.error("fetchHistoricalAssessments error:", err);
    }
    return {
        assessments: [],
        pagination: { limit, hasNext: false, nextCursor: null, count: 0 },
        filters: { userId, risk: risk !== "all" ? risk : null, startDate, endDate, sortOrder },
    };
}

/**
 * Fetch historical assessments for a specific user.
 * Protected by verifyAdmin.
 */
export async function fetchUserAssessments(userId, options = {}) {
    if (!userId) return { assessments: [], pagination: { limit: 10, hasNext: false, nextCursor: null, count: 0 } };
    return await fetchHistoricalAssessments({ ...options, userId });
}

/**
 * Fetch global historical assessment analytics, risk distributions, and cohort trends.
 * Protected by verifyAdmin.
 */
export async function fetchHistoricalAssessmentsAnalytics({
    startDate = null,
    endDate = null,
    risk = "all",
    studentId = null,
} = {}) {
    try {
        const token = await getIdToken();
        const paramObj = { risk };
        if (startDate) paramObj.startDate = startDate;
        if (endDate) paramObj.endDate = endDate;
        if (studentId) paramObj.studentId = studentId;

        const params = new URLSearchParams(paramObj);
        const res = await fetch(`${ADMIN_API_URL}/assessments/analytics?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
                return json.data;
            }
        }
    } catch (err) {
        console.error("fetchHistoricalAssessmentsAnalytics error:", err);
    }
    return null;
}



