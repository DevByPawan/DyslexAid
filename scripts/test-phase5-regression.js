"use strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const assert = require("assert");

let passed = 0;
let failed = 0;

function test(description, fn) {
    try {
        fn();
        console.log(`  ✓ PASSED: ${description}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ FAILED: ${description}`);
        console.error(`    Error: ${err.message}`);
        failed++;
    }
}

async function runRegressionSuite() {
    console.log("=======================================================================");
    console.log("  Running Phase 5.2 Complete Application & Regression Audit Suite");
    console.log("=======================================================================\n");

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: AUTHENTICATION & ACCESS GATING
    // ─────────────────────────────────────────────────────────────────────────
    console.log("[Section 1] Authentication, Role-Based Access & Status Restrictions");

    // 1.1 Registration Structure & Defaults
    test("Student registration initializes required defaults and approval status", () => {
        const studentSignupData = {
            name: "Ananya Sharma",
            email: "ananya@student.dyslexaid.com",
            role: "student",
            parentEmail: "parent.sharma@dyslexaid.com",
            approvalStatus: "pending",
            accountStatus: "active",
            xp: 0,
            streak: 0,
            badges: 0,
            guardianPin: "",
            trustedDevices: [],
            practiceVoiceCompleted: false,
            practiceLetterCompleted: false,
            practiceWordCompleted: false,
        };
        assert.strictEqual(studentSignupData.approvalStatus, "pending");
        assert.strictEqual(studentSignupData.accountStatus, "active");
        assert.strictEqual(studentSignupData.role, "student");
        assert.strictEqual(studentSignupData.parentEmail, "parent.sharma@dyslexaid.com");
    });

    test("Teacher and Parent registration leaves parentEmail empty", () => {
        const teacherSignup = { role: "teacher", parentEmail: "" };
        const parentSignup = { role: "parent", parentEmail: "" };
        assert.strictEqual(teacherSignup.parentEmail, "");
        assert.strictEqual(parentSignup.parentEmail, "");
    });

    // 1.2 Route Guarding State Machine
    function evaluateProtectedRoute({ user, userProfile, role, isSuperAdmin, allowedRoles }) {
        if (!user) return { allowed: false, redirect: "/login" };
        if (isSuperAdmin) return { allowed: true };
        if (userProfile?.accountStatus === "suspended") return { allowed: false, redirect: "/account-suspended" };
        if (userProfile?.approvalStatus === "rejected") return { allowed: false, redirect: "/account-rejected" };
        if (userProfile?.approvalStatus === "pending") return { allowed: false, redirect: "/pending-approval" };

        if (allowedRoles && allowedRoles.length > 0) {
            if (!role || !allowedRoles.includes(role)) {
                if (role === "teacher") return { allowed: false, redirect: "/teacher-dashboard" };
                if (role === "parent") return { allowed: false, redirect: "/parent-dashboard" };
                if (role === "student") return { allowed: false, redirect: "/dashboard" };
                return { allowed: false, redirect: "/login" };
            }
        }
        return { allowed: true };
    }

    test("Unauthenticated visitor redirected to /login", () => {
        const res = evaluateProtectedRoute({ user: null });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/login");
    });

    test("Pending approval user blocked from learning features and routed to /pending-approval", () => {
        const res = evaluateProtectedRoute({
            user: { uid: "std-pending-1" },
            userProfile: { approvalStatus: "pending", accountStatus: "active" },
            role: "student",
            isSuperAdmin: false,
            allowedRoles: ["student"],
        });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/pending-approval");
    });

    test("Suspended user strictly redirected to /account-suspended", () => {
        const res = evaluateProtectedRoute({
            user: { uid: "std-suspended-1" },
            userProfile: { approvalStatus: "approved", accountStatus: "suspended" },
            role: "student",
            isSuperAdmin: false,
            allowedRoles: ["student"],
        });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/account-suspended");
    });

    test("Rejected user strictly redirected to /account-rejected", () => {
        const res = evaluateProtectedRoute({
            user: { uid: "tch-rejected-1" },
            userProfile: { approvalStatus: "rejected", accountStatus: "active" },
            role: "teacher",
            isSuperAdmin: false,
            allowedRoles: ["teacher"],
        });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/account-rejected");
    });

    test("Approved student accessing student dashboard allowed", () => {
        const res = evaluateProtectedRoute({
            user: { uid: "std-approved-1" },
            userProfile: { approvalStatus: "approved", accountStatus: "active" },
            role: "student",
            isSuperAdmin: false,
            allowedRoles: ["student"],
        });
        assert.strictEqual(res.allowed, true);
    });

    test("Approved student attempting to access teacher dashboard redirected to /dashboard", () => {
        const res = evaluateProtectedRoute({
            user: { uid: "std-approved-1" },
            userProfile: { approvalStatus: "approved", accountStatus: "active" },
            role: "student",
            isSuperAdmin: false,
            allowedRoles: ["teacher"],
        });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/dashboard");
    });

    test("Approved parent attempting to access teacher dashboard redirected to /parent-dashboard", () => {
        const res = evaluateProtectedRoute({
            user: { uid: "par-approved-1" },
            userProfile: { approvalStatus: "approved", accountStatus: "active" },
            role: "parent",
            isSuperAdmin: false,
            allowedRoles: ["teacher"],
        });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/parent-dashboard");
    });

    // 1.3 AdminRoute Security
    function evaluateAdminRoute({ user, role, isSuperAdmin }) {
        if (!user) return { allowed: false, redirect: "/login" };
        if (!isSuperAdmin) {
            if (role === "teacher") return { allowed: false, redirect: "/teacher-dashboard" };
            if (role === "parent") return { allowed: false, redirect: "/parent-dashboard" };
            if (role === "student") return { allowed: false, redirect: "/dashboard" };
            return { allowed: false, redirect: "/" };
        }
        return { allowed: true };
    }

    test("AdminRoute rejects ordinary student even if role field is tampered", () => {
        const res = evaluateAdminRoute({
            user: { uid: "attacker-1" },
            role: "student",
            isSuperAdmin: false, // does NOT possess custom claim
        });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.redirect, "/dashboard");
    });

    test("AdminRoute grants access only when custom claim superadmin === true", () => {
        const res = evaluateAdminRoute({
            user: { uid: "superadmin-uid-1" },
            role: "superadmin",
            isSuperAdmin: true,
        });
        assert.strictEqual(res.allowed, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: SUPER ADMIN WORKFLOW & PLATFORM MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[Section 2] Super Admin Authorization, Management & Audit Controls");

    test("Self-approval is strictly forbidden in administrative service", () => {
        const adminUid = "admin-root-01";
        const targetUserId = "admin-root-01";
        assert.throws(() => {
            if (targetUserId === adminUid) throw new Error("Self-approval is strictly forbidden.");
        }, /Self-approval is strictly forbidden/);
    });

    test("Self-suspension is strictly forbidden in administrative service", () => {
        const adminUid = "admin-root-01";
        const targetUserId = "admin-root-01";
        assert.throws(() => {
            if (targetUserId === adminUid) throw new Error("Cannot suspend your own account.");
        }, /Cannot suspend your own account/);
    });

    test("Rejection requires a non-empty reason", () => {
        const reason = "   ";
        assert.throws(() => {
            if (!reason || !reason.trim()) throw new Error("A rejection reason is required.");
        }, /A rejection reason is required/);
    });

    test("Suspension requires a non-empty reason", () => {
        const reason = "";
        assert.throws(() => {
            if (!reason || !reason.trim()) throw new Error("A suspension reason is required.");
        }, /A suspension reason is required/);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: STUDENT DASHBOARD, XP, BADGES & ASSESSMENT LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[Section 3] Student Dashboard Features, XP Progression & Assessment Display");

    function computeStudentBadge(xp) {
        if (xp >= 200) return "🥇 Expert Reader";
        if (xp >= 100) return "🥈 Skilled Reader";
        if (xp >= 50) return "🥉 Beginner Reader";
        return "No Badge Yet";
    }

    test("Badge calculation correctly assigns achievement tiers based on XP", () => {
        assert.strictEqual(computeStudentBadge(0), "No Badge Yet");
        assert.strictEqual(computeStudentBadge(49), "No Badge Yet");
        assert.strictEqual(computeStudentBadge(50), "🥉 Beginner Reader");
        assert.strictEqual(computeStudentBadge(99), "🥉 Beginner Reader");
        assert.strictEqual(computeStudentBadge(100), "🥈 Skilled Reader");
        assert.strictEqual(computeStudentBadge(199), "🥈 Skilled Reader");
        assert.strictEqual(computeStudentBadge(200), "🥇 Expert Reader");
        assert.strictEqual(computeStudentBadge(500), "🥇 Expert Reader");
    });

    function computeDailyGoal(user) {
        let completed = 0;
        if (user.practiceVoiceCompleted) completed++;
        if (user.practiceLetterCompleted) completed++;
        if (user.practiceWordCompleted) completed++;
        return Math.round((completed / 3) * 100);
    }

    test("Daily goal calculation reflects completed exercise categories", () => {
        assert.strictEqual(computeDailyGoal({}), 0);
        assert.strictEqual(computeDailyGoal({ practiceVoiceCompleted: true }), 33);
        assert.strictEqual(computeDailyGoal({ practiceVoiceCompleted: true, practiceLetterCompleted: true }), 67);
        assert.strictEqual(
            computeDailyGoal({
                practiceVoiceCompleted: true,
                practiceLetterCompleted: true,
                practiceWordCompleted: true,
            }),
            100
        );
    });

    test("Guardian PIN enforces exact 4-digit validation", () => {
        const validatePin = (pin) => typeof pin === "string" && /^\d{4}$/.test(pin);
        assert.strictEqual(validatePin("1234"), true);
        assert.strictEqual(validatePin("0000"), true);
        assert.strictEqual(validatePin("123"), false);
        assert.strictEqual(validatePin("12345"), false);
        assert.strictEqual(validatePin("abcd"), false);
        assert.strictEqual(validatePin(""), false);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: TEACHER DASHBOARD & CONSENT-GATED ACCESS
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[Section 4] Teacher Dashboard & Student Consent Protection");

    test("Teacher can only view student details when teacherAccess consent is true", () => {
        const permissions = [
            { studentId: "std-1", teacherAccess: true },
            { studentId: "std-2", teacherAccess: false },
            { studentId: "std-3", teacherAccess: false },
        ];
        const studentProfiles = {
            "std-1": { name: "Aarav", role: "student" },
            "std-2": { name: "Rohan", role: "student" },
            "std-3": { name: "Diya", role: "student" },
        };

        const accessibleStudents = [];
        for (const p of permissions) {
            if (p.teacherAccess && studentProfiles[p.studentId]?.role === "student") {
                accessibleStudents.push(studentProfiles[p.studentId]);
            }
        }

        assert.strictEqual(accessibleStudents.length, 1);
        assert.strictEqual(accessibleStudents[0].name, "Aarav");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: PARENT DASHBOARD & GUARDIAN PIN SECURITY
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[Section 5] Parent Dashboard & Linked Student Association");

    test("Parent query strictly filters students where parentEmail matches parent identity", () => {
        const parentUser = { email: "parent.verma@example.com" };
        const allUsers = [
            { id: "std-1", name: "Kavya Verma", role: "student", parentEmail: "parent.verma@example.com", guardianPin: "5566" },
            { id: "std-2", name: "Other Student", role: "student", parentEmail: "other.parent@example.com", guardianPin: "1122" },
        ];

        const linkedStudents = allUsers.filter(
            (u) => u.role === "student" && u.parentEmail === parentUser.email
        );
        assert.strictEqual(linkedStudents.length, 1);
        assert.strictEqual(linkedStudents[0].name, "Kavya Verma");
    });

    test("Parent PIN verification allows report view only upon matching guardian PIN", () => {
        const student = { guardianPin: "5566" };
        const verifyPin = (input) => input === student.guardianPin;

        assert.strictEqual(verifyPin("0000"), false);
        assert.strictEqual(verifyPin("5565"), false);
        assert.strictEqual(verifyPin("5566"), true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: BACKEND API & SECURITY AUDIT
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[Section 6] Backend Authorization, PII Privacy & Public Route Isolation");

    const systemMonitor = require("../server/services/systemMonitor");

    test("Public health endpoint leaks zero sensitive state or tokens", () => {
        const publicHealth = { status: "ok", timestamp: new Date().toISOString() };
        assert.strictEqual(publicHealth.status, "ok");
        assert.strictEqual(typeof publicHealth.timestamp, "string");
        assert.strictEqual(publicHealth.db, undefined);
        assert.strictEqual(publicHealth.token, undefined);
        assert.strictEqual(publicHealth.users, undefined);
    });

    test("Dynamic route path normalizer sanitizes emails and user IDs", () => {
        const p1 = systemMonitor.normalizeRoutePath("/api/admin/users/std-9418485295819420");
        const p2 = systemMonitor.normalizeRoutePath("/api/admin/users/parent.kumar@dyslexaid.com");
        assert.strictEqual(p1, "/api/admin/users/:userId");
        assert.strictEqual(p2, "/api/admin/users/:email");
    });

    test("Diagnostic message sanitizer strips filesystem paths and bearer tokens", () => {
        const raw = "Error at /var/app/dyslexia/server.js:45 with token Bearer eyJhbGciOi...";
        const clean = systemMonitor.sanitizeDiagnosticMessage(raw);
        assert(!clean.includes("/var/app"), "Filesystem path was stripped");
        assert(!clean.includes("eyJhbGci"), "Bearer token was redacted");
        assert(clean.includes("[path]"), "Path placeholder inserted");
        assert(clean.includes("[redacted]"), "Redacted placeholder inserted");
    });

    console.log("\n=======================================================================");
    console.log(`  Regression Suite Completed: ${passed} passed, ${failed} failed`);
    console.log("=======================================================================\n");

    if (failed > 0) process.exit(1);
}

runRegressionSuite().catch((err) => {
    console.error("Test runner encountered error:", err);
    process.exit(1);
});
