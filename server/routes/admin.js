"use strict";
/**
 * Admin Routes
 * ────────────
 * All routes require the verifyAdmin middleware (token + superadmin claim).
 *
 * POST /api/admin/approve    – Approve a pending user
 * POST /api/admin/reject     – Reject a pending user (reason required)
 * POST /api/admin/suspend    – Suspend an approved user
 * POST /api/admin/reactivate – Reactivate a suspended user
 * GET  /api/admin/pending    – List all pending approval requests
 * GET  /api/admin/users      – List all users
 *
 * All approval/rejection/suspension operations use Firestore transactions
 * to prevent duplicate processing and race conditions.
 */
const express    = require("express");
const admin      = require("firebase-admin");
const verifyAdmin = require("../middleware/verifyAdmin");
const systemMonitor = require("../services/systemMonitor");

const router = express.Router();
const db     = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const FieldPath  = admin.firestore.FieldPath;

// Apply admin verification to all routes in this router
router.use(verifyAdmin);

// ── Helper: write an immutable audit event ───────────────────────────────────
async function writeAuditLog(txn, {
    action, adminId, adminEmail,
    targetUserId, targetUserEmail, targetUserName, targetUserRole,
    previousApprovalStatus, newApprovalStatus,
    previousAccountStatus, newAccountStatus,
    reason,
}) {
    const logRef = db.collection("auditLogs").doc();
    txn.set(logRef, {
        action,
        adminId,
        adminEmail,
        targetUserId,
        targetUserEmail:  targetUserEmail  || "",
        targetUserName:   targetUserName   || "",
        targetUserRole:   targetUserRole   || "",
        previousApprovalStatus: previousApprovalStatus || null,
        newApprovalStatus:      newApprovalStatus      || null,
        previousAccountStatus:  previousAccountStatus  || null,
        newAccountStatus:       newAccountStatus       || null,
        reason: reason || null,
        timestamp: FieldValue.serverTimestamp(),
    });
}

// ── POST /api/admin/approve ──────────────────────────────────────────────────
router.post("/approve", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required." });
    if (userId === req.adminUid) return res.status(400).json({ error: "Cannot approve your own account." });

    try {
        await db.runTransaction(async (txn) => {
            const userRef    = db.collection("users").doc(userId);
            const reqRef     = db.collection("approvalRequests").doc(userId);

            const [userSnap, reqSnap] = await Promise.all([txn.get(userRef), txn.get(reqRef)]);

            if (!userSnap.exists) throw new Error("User profile not found.");

            const userData = userSnap.data();
            if (userData.approvalStatus === "approved") {
                throw new Error("User is already approved.");
            }

            txn.update(userRef, {
                approvalStatus: "approved",
                accountStatus:  "active",
                approvedAt:     FieldValue.serverTimestamp(),
                approvedBy:     req.adminUid,
                rejectionReason: null,
            });

            if (reqSnap.exists) {
                txn.update(reqRef, {
                    status:        "approved",
                    processedAt:   FieldValue.serverTimestamp(),
                    processedBy:   req.adminUid,
                    processedByEmail: req.adminEmail,
                });
            }

            await writeAuditLog(txn, {
                action:                 "USER_APPROVED",
                adminId:                req.adminUid,
                adminEmail:             req.adminEmail,
                targetUserId:           userId,
                targetUserEmail:        userData.email,
                targetUserName:         userData.name,
                targetUserRole:         userData.role,
                previousApprovalStatus: userData.approvalStatus || "pending",
                newApprovalStatus:      "approved",
                previousAccountStatus:  userData.accountStatus  || "active",
                newAccountStatus:       "active",
                reason: null,
            });
        });

        return res.json({ success: true, message: "User approved successfully." });
    } catch (err) {
        console.error("[admin/approve] Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/admin/reject ───────────────────────────────────────────────────
router.post("/reject", async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required." });
    if (!reason || !reason.trim()) return res.status(400).json({ error: "A rejection reason is required." });
    if (userId === req.adminUid) return res.status(400).json({ error: "Cannot reject your own account." });

    try {
        await db.runTransaction(async (txn) => {
            const userRef = db.collection("users").doc(userId);
            const reqRef  = db.collection("approvalRequests").doc(userId);

            const [userSnap, reqSnap] = await Promise.all([txn.get(userRef), txn.get(reqRef)]);
            if (!userSnap.exists) throw new Error("User profile not found.");

            const userData = userSnap.data();
            if (userData.approvalStatus === "rejected") throw new Error("User is already rejected.");

            txn.update(userRef, {
                approvalStatus:  "rejected",
                rejectedAt:      FieldValue.serverTimestamp(),
                rejectedBy:      req.adminUid,
                rejectionReason: reason.trim(),
            });

            if (reqSnap.exists) {
                txn.update(reqRef, {
                    status:          "rejected",
                    rejectionReason: reason.trim(),
                    processedAt:     FieldValue.serverTimestamp(),
                    processedBy:     req.adminUid,
                    processedByEmail: req.adminEmail,
                });
            }

            await writeAuditLog(txn, {
                action:                 "USER_REJECTED",
                adminId:                req.adminUid,
                adminEmail:             req.adminEmail,
                targetUserId:           userId,
                targetUserEmail:        userData.email,
                targetUserName:         userData.name,
                targetUserRole:         userData.role,
                previousApprovalStatus: userData.approvalStatus || "pending",
                newApprovalStatus:      "rejected",
                reason: reason.trim(),
            });
        });

        return res.json({ success: true, message: "User rejected." });
    } catch (err) {
        console.error("[admin/reject] Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/admin/suspend ──────────────────────────────────────────────────
router.post("/suspend", async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required." });
    if (!reason || !reason.trim()) return res.status(400).json({ error: "A suspension reason is required." });
    if (userId === req.adminUid) return res.status(400).json({ error: "Cannot suspend your own account." });

    try {
        await db.runTransaction(async (txn) => {
            const userRef = db.collection("users").doc(userId);
            const userSnap = await txn.get(userRef);
            if (!userSnap.exists) throw new Error("User profile not found.");

            const userData = userSnap.data();
            if (userData.accountStatus === "suspended") throw new Error("User is already suspended.");

            txn.update(userRef, {
                accountStatus:    "suspended",
                suspendedAt:      FieldValue.serverTimestamp(),
                suspendedBy:      req.adminUid,
                suspensionReason: reason.trim(),
            });

            await writeAuditLog(txn, {
                action:               "USER_SUSPENDED",
                adminId:              req.adminUid,
                adminEmail:           req.adminEmail,
                targetUserId:         userId,
                targetUserEmail:      userData.email,
                targetUserName:       userData.name,
                targetUserRole:       userData.role,
                previousAccountStatus: userData.accountStatus || "active",
                newAccountStatus:      "suspended",
                reason: reason.trim(),
            });
        });

        return res.json({ success: true, message: "User suspended." });
    } catch (err) {
        console.error("[admin/suspend] Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/admin/reactivate ───────────────────────────────────────────────
router.post("/reactivate", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required." });
    if (userId === req.adminUid) return res.status(400).json({ error: "Cannot modify your own account." });

    try {
        await db.runTransaction(async (txn) => {
            const userRef  = db.collection("users").doc(userId);
            const userSnap = await txn.get(userRef);
            if (!userSnap.exists) throw new Error("User profile not found.");

            const userData = userSnap.data();

            txn.update(userRef, {
                approvalStatus:   "approved",
                accountStatus:    "active",
                suspendedAt:      null,
                suspendedBy:      null,
                suspensionReason: null,
            });

            await writeAuditLog(txn, {
                action:               "USER_REACTIVATED",
                adminId:              req.adminUid,
                adminEmail:           req.adminEmail,
                targetUserId:         userId,
                targetUserEmail:      userData.email,
                targetUserName:       userData.name,
                targetUserRole:       userData.role,
                previousApprovalStatus: userData.approvalStatus,
                newApprovalStatus:      "approved",
                previousAccountStatus:  userData.accountStatus,
                newAccountStatus:       "active",
            });
        });

        return res.json({ success: true, message: "User reactivated." });
    } catch (err) {
        console.error("[admin/reactivate] Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/admin/pending ───────────────────────────────────────────────────
router.get("/pending", async (req, res) => {
    try {
        const snap = await db.collection("approvalRequests")
            .where("status", "==", "pending")
            .orderBy("requestedAt", "desc")
            .get();

        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return res.json({ success: true, data: results });
    } catch (err) {
        console.error("[admin/pending] Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── Helper: Safe timestamp parsing ───────────────────────────────────────────
function parseTimestampMillis(val) {
    if (!val) return null;
    if (typeof val.toMillis === "function") return val.toMillis();
    if (typeof val === "number" && val > 0 && !isNaN(val)) return val;
    if (typeof val === "string") {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}

// ── GET /api/admin/overview ──────────────────────────────────────────────────
router.get("/overview", async (req, res) => {
    try {
        const usersSnap = await db.collection("users").get();
        let totalUsers = 0;
        let students = 0;
        let teachers = 0;
        let parents = 0;
        let pendingApprovals = 0;
        let approvedUsers = 0;
        let rejectedUsers = 0;
        let suspendedUsers = 0;
        let activeUsers = 0;
        let uniqueStudentsAssessed = 0;

        const now = Date.now();
        const activeWindow = 30 * 86400000; // active in last 30 days

        usersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.role === "superadmin") return;

            totalUsers++;
            if (data.role === "student") students++;
            else if (data.role === "teacher") teachers++;
            else if (data.role === "parent") parents++;

            const appStatus = data.approvalStatus || "pending";
            if (appStatus === "pending") pendingApprovals++;
            else if (appStatus === "approved") approvedUsers++;
            else if (appStatus === "rejected") rejectedUsers++;

            const accStatus = data.accountStatus || "active";
            if (accStatus === "suspended") suspendedUsers++;
            else if (accStatus === "active") {
                // Active user definition: active standing with activity in last 30 days or recent creation
                const lastLoginMillis = parseTimestampMillis(data.lastLogin);
                const createdMillis = parseTimestampMillis(data.createdAt);
                const lastActivity = lastLoginMillis || createdMillis || 0;
                if (now - lastActivity <= activeWindow || !lastLoginMillis) {
                    activeUsers++;
                }
            }

            if (data.role === "student") {
                if (data.lastAssessmentDate || data.lastRisk || data.lastScore !== undefined) {
                    uniqueStudentsAssessed++;
                }
            }
        });

        // Dedicated assessment attempts count from /assessments collection (the true source of attempts history)
        let totalAssessments = null;
        let totalAssessmentsAvailable = false;
        let assessmentCollCount = null;
        try {
            const assessCountSnap = await db.collection("assessments").count().get();
            assessmentCollCount = assessCountSnap.data().count;
        } catch {
            try {
                const assessSnap = await db.collection("assessments").get();
                assessmentCollCount = assessSnap.size;
            } catch {
                assessmentCollCount = null;
            }
        }

        if (typeof assessmentCollCount === "number" && assessmentCollCount > 0) {
            totalAssessments = assessmentCollCount;
            totalAssessmentsAvailable = true;
        } else if (assessmentCollCount === 0 && uniqueStudentsAssessed === 0) {
            totalAssessments = 0;
            totalAssessmentsAvailable = true;
        } else {
            // Either the collection query failed, or collection has 0 attempt records
            // while students have evaluation data (client wrote to user docs without creating distinct /assessments docs).
            // Do NOT estimate or fall back to student count; return explicit unavailable state.
            totalAssessments = null;
            totalAssessmentsAvailable = false;
        }

        return res.json({
            success: true,
            data: {
                totalUsers,
                students,
                teachers,
                parents,
                pendingApprovals,
                approvedUsers,
                rejectedUsers,
                suspendedUsers,
                activeUsers,
                totalAssessments,
                totalAssessmentsAvailable,
                uniqueStudentsAssessed,
            },
        });
    } catch (err) {
        console.error("[admin/overview] Internal error:", err.message);
        return res.status(500).json({ error: "Failed to retrieve platform overview. Please try again later." });
    }
});

// ── GET /api/admin/analytics ────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
    try {
        const validRanges = ["7d", "30d", "90d", "all"];
        const range = validRanges.includes(req.query.range) ? req.query.range : "30d";

        const now = Date.now();
        let cutoffTime = 0;
        if (range === "7d") cutoffTime = now - 7 * 86400000;
        else if (range === "30d") cutoffTime = now - 30 * 86400000;
        else if (range === "90d") cutoffTime = now - 90 * 86400000;

        const usersSnap = await db.collection("users").get();
        const users = [];
        let students = 0;
        let teachers = 0;
        let parents = 0;
        let pending = 0;
        let approved = 0;
        let rejected = 0;
        let active = 0;
        let suspended = 0;
        let inactive = 0;
        let uniqueStudentsAssessed = 0;

        const riskCounts = {
            "Low Risk": 0,
            "Moderate Risk": 0,
            "High Risk": 0,
            "Not Assessed": 0,
        };

        let totalAccuracySum = 0;
        let accuracyCount = 0;
        let totalScoreSum = 0;
        let scoreCount = 0;
        let practiceLetterCompleted = 0;
        let practiceVoiceCompleted = 0;
        let practiceWordCompleted = 0;

        const registrationDateBuckets = {};
        const assessmentDateBuckets = {};

        usersSnap.forEach((doc) => {
            const data = doc.data();
            if (data.role === "superadmin") return;
            users.push({ id: doc.id, ...data });

            // Role
            if (data.role === "student") students++;
            else if (data.role === "teacher") teachers++;
            else if (data.role === "parent") parents++;

            // Approval
            const app = data.approvalStatus || "pending";
            if (app === "pending") pending++;
            else if (app === "approved") approved++;
            else if (app === "rejected") rejected++;

            // Account status
            const acc = data.accountStatus || "active";
            if (acc === "active") active++;
            else if (acc === "suspended") suspended++;
            else if (acc === "inactive") inactive++;

            // Assessment metrics (students)
            if (data.role === "student") {
                const hasAssessment = data.lastAssessmentDate || data.lastRisk || data.lastScore !== undefined;
                if (hasAssessment) {
                    uniqueStudentsAssessed++;
                }

                const risk = data.lastRisk || "Not Assessed";
                if (riskCounts[risk] !== undefined) {
                    riskCounts[risk]++;
                } else {
                    riskCounts["Not Assessed"]++;
                }

                if (typeof data.lastAccuracy === "number" && !isNaN(data.lastAccuracy)) {
                    totalAccuracySum += data.lastAccuracy;
                    accuracyCount++;
                }
                if (typeof data.lastScore === "number" && !isNaN(data.lastScore)) {
                    totalScoreSum += data.lastScore;
                    scoreCount++;
                }
                if (data.practiceLetterCompleted) practiceLetterCompleted++;
                if (data.practiceVoiceCompleted) practiceVoiceCompleted++;
                if (data.practiceWordCompleted) practiceWordCompleted++;

                // Track student assessment date if present and valid
                const assessMillis = parseTimestampMillis(data.lastAssessmentDate);
                if (assessMillis && (cutoffTime === 0 || assessMillis >= cutoffTime)) {
                    const dateKey = new Date(assessMillis).toISOString().slice(0, 10);
                    assessmentDateBuckets[dateKey] = (assessmentDateBuckets[dateKey] || 0) + 1;
                }
            }

            // Registration trends bucket
            const createdMillis = parseTimestampMillis(data.createdAt);
            if (createdMillis && (cutoffTime === 0 || createdMillis >= cutoffTime)) {
                const dateKey = new Date(createdMillis).toISOString().slice(0, 10);
                registrationDateBuckets[dateKey] = (registrationDateBuckets[dateKey] || 0) + 1;
            }
        });

        // Audit Logs for activity trends
        const auditSnap = await db.collection("auditLogs").get();
        const activityDateBuckets = {};
        auditSnap.forEach((doc) => {
            const data = doc.data();
            const millis = parseTimestampMillis(data.timestamp);
            if (millis && (cutoffTime === 0 || millis >= cutoffTime)) {
                const dateKey = new Date(millis).toISOString().slice(0, 10);
                activityDateBuckets[dateKey] = (activityDateBuckets[dateKey] || 0) + 1;
            }
        });

        // Assessment trends from /assessments collection if present
        let assessmentsCollTotal = 0;
        try {
            const assessSnap = await db.collection("assessments").get();
            assessmentsCollTotal = assessSnap.size;
            if (assessSnap.size > 0) {
                // If assessments collection has records, use its timestamps
                Object.keys(assessmentDateBuckets).forEach((k) => delete assessmentDateBuckets[k]);
                assessSnap.forEach((doc) => {
                    const data = doc.data();
                    const millis = parseTimestampMillis(data.completedAt || data.createdAt);
                    if (millis && (cutoffTime === 0 || millis >= cutoffTime)) {
                        const dateKey = new Date(millis).toISOString().slice(0, 10);
                        assessmentDateBuckets[dateKey] = (assessmentDateBuckets[dateKey] || 0) + 1;
                    }
                });
            }
        } catch {
            // Optional collection
        }

        // Format timeline buckets sorted chronologically
        const formatTrend = (buckets) => {
            const dates = Object.keys(buckets).sort();
            return dates.map((date) => ({
                date,
                label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                count: buckets[date],
            }));
        };

        const registrationTrends = formatTrend(registrationDateBuckets);
        const activityTrends = formatTrend(activityDateBuckets);
        const assessmentTrends = formatTrend(assessmentDateBuckets);

        const totalUsers = users.length;
        let totalAssessments = null;
        let totalAssessmentsAvailable = false;
        if (typeof assessmentsCollTotal === "number" && assessmentsCollTotal > 0) {
            totalAssessments = assessmentsCollTotal;
            totalAssessmentsAvailable = true;
        } else if (assessmentsCollTotal === 0 && uniqueStudentsAssessed === 0) {
            totalAssessments = 0;
            totalAssessmentsAvailable = true;
        } else {
            // Collection has 0 attempt records while students have been evaluated
            // (meaning historical attempts were unrecorded). Return explicit unavailable state.
            totalAssessments = null;
            totalAssessmentsAvailable = false;
        }

        const uniqueDays = Object.keys(registrationDateBuckets).length;
        const hasHistoricalData = uniqueDays > 1;

        return res.json({
            success: true,
            data: {
                range,
                overview: {
                    totalUsers,
                    students,
                    teachers,
                    parents,
                    pendingApprovals: pending,
                    approvedUsers: approved,
                    rejectedUsers: rejected,
                    suspendedUsers: suspended,
                    activeUsers: active,
                    totalAssessments,
                    totalAssessmentsAvailable,
                    uniqueStudentsAssessed,
                },
                roleDistribution: {
                    students,
                    teachers,
                    parents,
                    studentsPct: totalUsers ? Math.round((students / totalUsers) * 100) : 0,
                    teachersPct: totalUsers ? Math.round((teachers / totalUsers) * 100) : 0,
                    parentsPct: totalUsers ? Math.round((parents / totalUsers) * 100) : 0,
                },
                approvalDistribution: {
                    pending,
                    approved,
                    rejected,
                    pendingPct: totalUsers ? Math.round((pending / totalUsers) * 100) : 0,
                    approvedPct: totalUsers ? Math.round((approved / totalUsers) * 100) : 0,
                    rejectedPct: totalUsers ? Math.round((rejected / totalUsers) * 100) : 0,
                },
                accountStatusDistribution: {
                    active,
                    suspended,
                    inactive,
                    activePct: totalUsers ? Math.round((active / totalUsers) * 100) : 0,
                    suspendedPct: totalUsers ? Math.round((suspended / totalUsers) * 100) : 0,
                },
                registrationTrends,
                activityTrends,
                assessmentTrends,
                assessmentStats: {
                    totalCompleted: totalAssessments,
                    totalAssessmentsAvailable,
                    uniqueStudentsAssessed,
                    riskDistribution: riskCounts,
                    averageAccuracy: accuracyCount ? Math.round((totalAccuracySum / accuracyCount) * 10) / 10 : null,
                    averageScore: scoreCount ? Math.round((totalScoreSum / scoreCount) * 10) / 10 : null,
                    typeBreakdown: {
                        "Dyslexia Screening": totalAssessmentsAvailable ? totalAssessments : "Unavailable",
                        "Letter Recognition": practiceLetterCompleted,
                        "Voice Practice": practiceVoiceCompleted,
                        "Word Practice": practiceWordCompleted,
                    },
                },
                hasHistoricalData,
            },
        });
    } catch (err) {
        console.error("[admin/analytics] Internal error:", err.message);
        return res.status(500).json({ error: "Failed to compile platform analytics. Please try again later." });
    }
});

// ── GET /api/admin/users (Sanitized, validated, server-paginated & privacy-hardened)
router.get("/users", async (req, res) => {
    try {
        // 1. Strict Query Parameter Validation
        const rawPage = req.query.page;
        const page = rawPage !== undefined ? parseInt(rawPage, 10) : 1;
        if (isNaN(page) || page < 1) {
            return res.status(400).json({ error: "Invalid page parameter: must be a positive integer." });
        }

        const rawLimit = req.query.limit;
        let limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 10;
        if (isNaN(limit) || limit < 1) {
            return res.status(400).json({ error: "Invalid limit parameter: must be a positive integer." });
        }
        if (limit > 50) {
            limit = 50; // enforce strict maximum page size of 50
        }

        const validRoles = ["all", "student", "teacher", "parent"];
        const roleFilter = req.query.role || "all";
        if (!validRoles.includes(roleFilter)) {
            return res.status(400).json({ error: "Invalid role filter." });
        }

        const validApprovals = ["all", "pending", "approved", "rejected"];
        const approvalFilter = req.query.approvalStatus || "all";
        if (!validApprovals.includes(approvalFilter)) {
            return res.status(400).json({ error: "Invalid approvalStatus filter." });
        }

        const validAccounts = ["all", "active", "inactive", "suspended"];
        const accountFilter = req.query.accountStatus || "all";
        if (!validAccounts.includes(accountFilter)) {
            return res.status(400).json({ error: "Invalid accountStatus filter." });
        }

        const validSortBy = ["createdAt", "name", "xp", "streak", "role"];
        const sortBy = req.query.sortBy || "createdAt";
        if (!validSortBy.includes(sortBy)) {
            return res.status(400).json({ error: "Invalid sortBy field." });
        }

        const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
        const search = (req.query.search || "").trim();
        const rawCursor = req.query.cursor ? String(req.query.cursor).trim() : null;
        let cursor = null;
        if (rawCursor) {
            // Strictly validate document ID format to prevent malformed queries or injection
            if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawCursor)) {
                return res.status(400).json({ error: "Invalid cursor format: must be a valid alphanumeric document identifier." });
            }
            cursor = rawCursor;
        }

        // 2. Exact UID O(1) Lookup Optimization
        if (search && search.length >= 20 && !search.includes(" ") && !search.includes("@")) {
            try {
                const singleDoc = await db.collection("users").doc(search).get();
                if (singleDoc.exists) {
                    const data = singleDoc.data();
                    if (data.role !== "superadmin") {
                        const matchRole = roleFilter === "all" || data.role === roleFilter;
                        const matchApp = approvalFilter === "all" || (data.approvalStatus || "pending") === approvalFilter;
                        const matchAcc = accountFilter === "all" || (data.accountStatus || "active") === accountFilter;

                        if (matchRole && matchApp && matchAcc) {
                            const userItem = sanitizeUserSummary(singleDoc.id, data);
                            return res.json({
                                success: true,
                                data: {
                                    users: [userItem],
                                    pagination: {
                                        total: 1,
                                        page: 1,
                                        limit,
                                        totalPages: 1,
                                        hasNext: false,
                                        hasPrev: false,
                                        nextCursor: null,
                                    },
                                },
                            });
                        }
                    }
                }
            } catch {
                // fall through to general query
            }
        }

        // 3. Scalable Query Strategy (No full-collection memory scans)
        let baseQuery = db.collection("users");

        if (roleFilter !== "all") {
            baseQuery = baseQuery.where("role", "==", roleFilter);
        }
        if (approvalFilter !== "all") {
            baseQuery = baseQuery.where("approvalStatus", "==", approvalFilter);
        }
        if (accountFilter !== "all") {
            baseQuery = baseQuery.where("accountStatus", "==", accountFilter);
        }

        let total = 0;
        let docs = [];

        if (search) {
            // Scalable prefix search on normalized email or name
            const isEmailSearch = search.includes("@");
            const searchField = isEmailSearch ? "email" : "name";

            const searchTitle = !isEmailSearch && search.length > 0
                ? search.charAt(0).toUpperCase() + search.slice(1)
                : search;

            let searchQuery = baseQuery
                .where(searchField, ">=", search)
                .where(searchField, "<=", search + "\uf8ff")
                .orderBy(searchField, "asc")
                .orderBy(FieldPath.documentId(), "asc");

            try {
                const countSnap = await searchQuery.count().get();
                total = countSnap.data().count;
            } catch {
                total = 0;
            }

            let pageQuery = searchQuery;
            if (cursor) {
                const cursorDoc = await db.collection("users").doc(cursor).get();
                if (cursorDoc.exists) {
                    pageQuery = pageQuery.startAfter(cursorDoc);
                } else if (page > 1) {
                    // Resilient fallback: if cursor document was deleted between requests, use offset
                    pageQuery = pageQuery.offset((page - 1) * limit);
                }
            } else if (page > 1) {
                pageQuery = pageQuery.offset((page - 1) * limit);
            }
            pageQuery = pageQuery.limit(limit);

            const snap = await pageQuery.get();
            docs = snap.docs;

            // Title-cased fallback if search was lowercase and 0 results found
            if (docs.length === 0 && search !== searchTitle && !cursor && page === 1) {
                let altQuery = baseQuery
                    .where(searchField, ">=", searchTitle)
                    .where(searchField, "<=", searchTitle + "\uf8ff")
                    .orderBy(searchField, "asc")
                    .orderBy(FieldPath.documentId(), "asc");

                try {
                    const altCountSnap = await altQuery.count().get();
                    total = altCountSnap.data().count;
                } catch {
                    total = 0;
                }

                const altSnap = await altQuery.limit(limit).get();
                docs = altSnap.docs;
            }
        } else {
            // Standard directory view: ordered by sortBy + deterministic ID tie-breaker
            let orderedQuery = baseQuery
                .orderBy(sortBy, sortOrder)
                .orderBy(FieldPath.documentId(), sortOrder);

            try {
                const countSnap = await orderedQuery.count().get();
                total = countSnap.data().count;
            } catch {
                try {
                    const fallbackSnap = await baseQuery.get();
                    total = fallbackSnap.size;
                } catch {
                    total = 0;
                }
            }

            let pageQuery = orderedQuery;
            if (cursor) {
                const cursorDoc = await db.collection("users").doc(cursor).get();
                if (cursorDoc.exists) {
                    pageQuery = pageQuery.startAfter(cursorDoc);
                } else if (page > 1) {
                    // Resilient fallback: if cursor document was deleted between requests, use offset
                    pageQuery = pageQuery.offset((page - 1) * limit);
                }
            } else if (page > 1) {
                pageQuery = pageQuery.offset((page - 1) * limit);
            }
            pageQuery = pageQuery.limit(limit);

            const snap = await pageQuery.get();
            docs = snap.docs;
        }

        // Exclude superadmin and sanitize
        const validUsers = [];
        for (const d of docs) {
            const data = d.data();
            if (data.role !== "superadmin") {
                validUsers.push(sanitizeUserSummary(d.id, data));
            }
        }

        const nextCursor = docs.length === limit ? docs[docs.length - 1].id : null;
        const totalPages = Math.ceil(total / limit) || 1;

        return res.json({
            success: true,
            data: {
                users: validUsers,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNext: cursor ? Boolean(nextCursor) : page < totalPages,
                    hasPrev: cursor ? true : page > 1,
                    nextCursor,
                },
            },
        });
    } catch (err) {
        console.error("[admin/users] Internal error:", err.message);
        return res.status(500).json({ error: "Failed to retrieve user list. Please try again later." });
    }
});

// Helper: Sanitize User Summary (Explicit privacy boundary)
function sanitizeUserSummary(id, data) {
    return {
        id,
        name: data.name || "",
        email: data.email || "",
        role: data.role || "student",
        approvalStatus: data.approvalStatus || "pending",
        accountStatus: data.accountStatus || "active",
        createdAt: parseTimestampMillis(data.createdAt),
        lastLogin: parseTimestampMillis(data.lastLogin),
        xp: typeof data.xp === "number" ? data.xp : 0,
        streak: typeof data.streak === "number" ? data.streak : 0,
        badges: typeof data.badges === "number" ? data.badges : 0,
        parentEmail: data.parentEmail || "",
        hasGuardianPin: Boolean(data.guardianPin), // Never returns the actual PIN
        trustedDevicesCount: Array.isArray(data.trustedDevices) ? data.trustedDevices.length : 0, // Never returns device credentials
        lastRisk: data.lastRisk || null,
        lastAssessmentDate: data.lastAssessmentDate || null,
        lastAccuracy: typeof data.lastAccuracy === "number" ? data.lastAccuracy : null,
        lastScore: typeof data.lastScore === "number" ? data.lastScore : null,
        voiceScore: typeof data.voiceScore === "number" ? data.voiceScore : null,
        letterScore: typeof data.letterScore === "number" ? data.letterScore : null,
        wordScore: typeof data.wordScore === "number" ? data.wordScore : null,
        rejectionReason: data.rejectionReason || null,
        suspensionReason: data.suspensionReason || null,
        approvedAt: parseTimestampMillis(data.approvedAt),
        approvedBy: data.approvedBy || null,
        suspendedAt: parseTimestampMillis(data.suspendedAt),
        suspendedBy: data.suspendedBy || null,
    };
}

// ── GET /api/admin/users/:userId (Detailed User Profile & History) ────────────
router.get("/users/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required." });
    }

    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const data = userDoc.data();
        if (data.role === "superadmin") {
            return res.status(403).json({ error: "Super Admin details cannot be inspected via this endpoint." });
        }

        // Fetch audit history for this specific user
        const auditSnap = await db.collection("auditLogs")
            .where("targetUserId", "==", userId)
            .orderBy("timestamp", "desc")
            .limit(20)
            .get();

        const auditTrail = auditSnap.docs.map((d) => {
            const logData = d.data();
            return {
                id: d.id,
                action: logData.action,
                adminEmail: logData.adminEmail,
                adminId: logData.adminId,
                targetUserId: logData.targetUserId,
                previousApprovalStatus: logData.previousApprovalStatus,
                newApprovalStatus: logData.newApprovalStatus,
                previousAccountStatus: logData.previousAccountStatus,
                newAccountStatus: logData.newAccountStatus,
                reason: logData.reason || null,
                timestamp: parseTimestampMillis(logData.timestamp),
            };
        });

        // Fetch student permissions if relevant (sanitized without private tokens)
        let permissions = null;
        if (data.role === "student") {
            try {
                const permDoc = await db.collection("permissions").doc(userId).get();
                if (permDoc.exists) {
                    const permData = permDoc.data();
                    permissions = {
                        teacherAccess: Boolean(permData.teacherAccess),
                        parentAccess: Boolean(permData.parentAccess),
                        consentGiven: Boolean(permData.consentGiven),
                        updatedAt: parseTimestampMillis(permData.updatedAt),
                    };
                }
            } catch {
                // optional
            }
        }

        return res.json({
            success: true,
            data: {
                id: userDoc.id,
                name: data.name,
                email: data.email,
                role: data.role,
                approvalStatus: data.approvalStatus || "pending",
                accountStatus: data.accountStatus || "active",
                createdAt: parseTimestampMillis(data.createdAt),
                lastLogin: parseTimestampMillis(data.lastLogin),
                xp: typeof data.xp === "number" ? data.xp : 0,
                streak: typeof data.streak === "number" ? data.streak : 0,
                badges: typeof data.badges === "number" ? data.badges : 0,
                parentEmail: data.parentEmail || "",
                hasGuardianPin: Boolean(data.guardianPin), // Never returns the actual PIN
                trustedDevicesCount: Array.isArray(data.trustedDevices) ? data.trustedDevices.length : 0, // Never returns device tokens/credentials
                lastRisk: data.lastRisk || null,
                lastAssessmentDate: data.lastAssessmentDate || null,
                lastAccuracy: typeof data.lastAccuracy === "number" ? data.lastAccuracy : null,
                lastScore: typeof data.lastScore === "number" ? data.lastScore : null,
                voiceScore: typeof data.voiceScore === "number" ? data.voiceScore : null,
                letterScore: typeof data.letterScore === "number" ? data.letterScore : null,
                wordScore: typeof data.wordScore === "number" ? data.wordScore : null,
                practiceLetterCompleted: Boolean(data.practiceLetterCompleted),
                practiceVoiceCompleted: Boolean(data.practiceVoiceCompleted),
                practiceWordCompleted: Boolean(data.practiceWordCompleted),
                rejectionReason: data.rejectionReason || null,
                suspensionReason: data.suspensionReason || null,
                approvedAt: parseTimestampMillis(data.approvedAt),
                approvedBy: data.approvedBy || null,
                suspendedAt: parseTimestampMillis(data.suspendedAt),
                suspendedBy: data.suspendedBy || null,
                permissions,
                auditTrail,
            },
        });
    } catch (err) {
        console.error("[admin/user-details] Internal error:", err.message);
        return res.status(500).json({ error: "Failed to retrieve user details. Please try again later." });
    }
});

// ── GET /api/admin/audit-logs (Validated, sanitized & paginated) ──────────────
router.get("/audit-logs", async (req, res) => {
    try {
        const validActions = ["all", "USER_APPROVED", "USER_REJECTED", "USER_SUSPENDED", "USER_REACTIVATED"];
        const actionFilter = req.query.action || "all";
        if (!validActions.includes(actionFilter)) {
            return res.status(400).json({ error: "Invalid action filter." });
        }

        const rawPage = req.query.page;
        const page = rawPage !== undefined ? parseInt(rawPage, 10) : 1;
        if (isNaN(page) || page < 1) {
            return res.status(400).json({ error: "Invalid page parameter: must be a positive integer." });
        }

        const rawLimit = req.query.limit;
        let limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 10;
        if (isNaN(limit) || limit < 1) {
            return res.status(400).json({ error: "Invalid limit parameter: must be a positive integer." });
        }
        if (limit > 50) {
            limit = 50; // enforce strict maximum
        }

        const search = (req.query.search || "").toLowerCase().trim();

        let queryRef = db.collection("auditLogs").orderBy("timestamp", "desc");
        if (actionFilter !== "all") {
            queryRef = queryRef.where("action", "==", actionFilter);
        }

        const snap = await queryRef.get();

        let logs = [];
        snap.forEach((d) => {
            const data = d.data();
            const id = d.id;
            const targetUserEmail = data.targetUserEmail || "";
            const targetUserId = data.targetUserId || "";
            const adminEmail = data.adminEmail || "";
            const action = data.action || "";

            if (search) {
                const matchEmail = targetUserEmail.toLowerCase().includes(search);
                const matchId = targetUserId.toLowerCase().includes(search);
                const matchAdmin = adminEmail.toLowerCase().includes(search);
                const matchAction = action.toLowerCase().includes(search);
                if (!matchEmail && !matchId && !matchAdmin && !matchAction) return;
            }

            logs.push({
                id,
                action: data.action,
                adminId: data.adminId,
                adminEmail: data.adminEmail,
                targetUserId: data.targetUserId,
                targetUserEmail: data.targetUserEmail || "",
                targetUserName: data.targetUserName || "",
                targetUserRole: data.targetUserRole || "",
                previousApprovalStatus: data.previousApprovalStatus || null,
                newApprovalStatus: data.newApprovalStatus || null,
                previousAccountStatus: data.previousAccountStatus || null,
                newAccountStatus: data.newAccountStatus || null,
                reason: data.reason || null,
                timestamp: parseTimestampMillis(data.timestamp),
            });
        });

        // Stable tie-breaker sort
        logs.sort((a, b) => {
            const timeDiff = (b.timestamp || 0) - (a.timestamp || 0);
            if (timeDiff !== 0) return timeDiff;
            return a.id.localeCompare(b.id);
        });

        const total = logs.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const startIndex = (page - 1) * limit;
        const paginatedLogs = logs.slice(startIndex, startIndex + limit);

        return res.json({
            success: true,
            data: {
                logs: paginatedLogs,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                },
            },
        });
    } catch (err) {
        console.error("[admin/audit-logs] Internal error:", err.message);
        return res.status(500).json({ error: "Failed to retrieve audit logs. Please try again later." });
    }
});

// ── GET /api/admin/system/health ─────────────────────────────────────────────
router.get("/system/health", async (_req, res) => {
    try {
        const flaskUrl = process.env.FLASK_ML_URL || "https://dyslexaid-backend.onrender.com";
        const health = await systemMonitor.checkHealth({ db, admin, flaskUrl });
        return res.json({
            success: true,
            data: health,
        });
    } catch (err) {
        console.error("[admin/system/health] Error:", err.message);
        return res.status(500).json({ error: "Failed to perform system health check." });
    }
});

// ── GET /api/admin/system/metrics ────────────────────────────────────────────
router.get("/system/metrics", (_req, res) => {
    try {
        const metrics = systemMonitor.getMetrics();
        return res.json({
            success: true,
            data: metrics,
        });
    } catch (err) {
        console.error("[admin/system/metrics] Error:", err.message);
        return res.status(500).json({ error: "Failed to compile system metrics." });
    }
});

// ── GET /api/admin/system/incidents ──────────────────────────────────────────
router.get("/system/incidents", (req, res) => {
    try {
        const { severity = "all", service = "all", limit = 50 } = req.query;
        const validSeverities = ["all", "critical", "error", "warning", "info"];
        if (!validSeverities.includes(severity)) {
            return res.status(400).json({ error: "Invalid severity filter." });
        }

        const incidentsData = systemMonitor.getIncidents({
            severity,
            service,
            limit: Math.min(parseInt(limit, 10) || 50, 100),
        });

        return res.json({
            success: true,
            data: incidentsData,
        });
    } catch (err) {
        console.error("[admin/system/incidents] Error:", err.message);
        return res.status(500).json({ error: "Failed to retrieve system incidents." });
    }
});

// ── POST /api/admin/system/incidents ─────────────────────────────────────────
router.post("/system/incidents", (req, res) => {
    try {
        const { eventType, service, severity, message } = req.body;
        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "Incident message is required and must be a non-empty string." });
        }

        const validSeverities = ["critical", "error", "warning", "info"];
        if (severity && !validSeverities.includes(severity)) {
            return res.status(400).json({ error: "Invalid incident severity." });
        }

        const validServices = ["admin-console", "admin-backend", "firestore", "firebase-auth", "flask-ml"];
        if (service && !validServices.includes(service)) {
            return res.status(400).json({ error: "Invalid incident service." });
        }

        const validTypes = ["MANUAL_ALERT", "OPERATIONAL_NOTE", "MAINTENANCE_WINDOW", "CANARY_TEST"];
        if (eventType && !validTypes.includes(eventType)) {
            return res.status(400).json({ error: "Invalid incident eventType." });
        }

        // Sanitize message: strip HTML and truncate
        const sanitizedMsg = message
            .replace(/<[^>]*>?/gm, "")
            .replace(/(\/[a-zA-Z0-9_\-.]+)+/g, "[path]")
            .trim()
            .slice(0, 300);

        const incident = systemMonitor.recordIncident({
            eventType: eventType || "MANUAL_ALERT",
            service: service || "admin-console",
            severity: severity || "warning",
            message: sanitizedMsg,
            details: { reportedBy: req.adminUid },
        });

        return res.json({
            success: true,
            data: incident,
        });
    } catch (err) {
        console.error("[admin/system/incidents:post] Error:", err.message);
        return res.status(500).json({ error: "Failed to record system incident." });
    }
});

module.exports = router;

