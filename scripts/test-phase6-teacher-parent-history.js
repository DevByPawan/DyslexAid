"use strict";
/**
 * DyslexAid - Phase 6.4 Teacher and Parent Historical Assessment Views Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the Teacher and Parent historical assessment service functions,
 * security boundaries, access controls, data sanitization, and cursor pagination:
 *  1. Teacher Authorization: Approved status, active account, and student teacherAccess consent.
 *  2. Teacher Access Control: Immediate rejection of unapproved, suspended, or unconsented requests.
 *  3. Parent Authorization: Approved status, active account, and matching parentEmail on child profile.
 *  4. Parent-Child Isolation: Cross-parent child isolation, case-insensitive email matching, non-student rejection.
 *  5. Data Sanitization: Stripping raw audio waveforms and tokens from teacher and parent payloads.
 *  6. Pure Cursor Pagination: Deterministic cursor stepping and hasNext detection.
 *  7. Chronological Progress Mapping: ASC order sorting for trend visualization.
 *  8. Empty State & Error Resilience: Graceful zero-assessment handling and failure recovery.
 */

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

async function testAsync(description, fn) {
    try {
        await fn();
        console.log(`  ✓ PASSED: ${description}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ FAILED: ${description}`);
        console.error(`    Error: ${err.message}`);
        failed++;
    }
}

// ── In-Memory Mock Service Implementation ──────────────────────────────────────

function createMockEnvironment({
    currentUser = null,
    users = {},
    permissions = {},
    assessments = [],
    shouldFail = false,
}) {
    const authState = { currentUser };

    function sanitizeStudentAssessment(docSnap) {
        const data = docSnap.data ? docSnap.data() : docSnap;
        const id = docSnap.id || data.id || "";

        const parseMillis = (val) => {
            if (!val) return null;
            if (typeof val.toMillis === "function") return val.toMillis();
            if (typeof val === "number" && !isNaN(val)) return val;
            if (typeof val === "string") {
                const parsed = Date.parse(val);
                return isNaN(parsed) ? null : parsed;
            }
            return null;
        };

        return {
            id,
            userId: data.userId || "",
            type: data.type || "comprehensive_screening",
            score: typeof data.score === "number" ? Math.min(100, Math.max(0, data.score)) : 0,
            accuracy: typeof data.accuracy === "number" ? Math.min(100, Math.max(0, data.accuracy)) : 0,
            risk: data.risk || "Unknown",
            mlRisk: data.mlRisk || "Unknown",
            subScores: {
                voiceAccuracy: typeof data.subScores?.voiceAccuracy === "number" ? data.subScores.voiceAccuracy : 0,
                letterScore: typeof data.subScores?.letterScore === "number" ? data.subScores.letterScore : 0,
                wordScore: typeof data.subScores?.wordScore === "number" ? data.subScores.wordScore : 0,
            },
            insights: {
                strengths: Array.isArray(data.insights?.strengths) ? data.insights.strengths : [],
                improvements: Array.isArray(data.insights?.improvements) ? data.insights.improvements : [],
            },
            completedAt: parseMillis(data.completedAt),
            createdAt: parseMillis(data.createdAt),
        };
    }

    async function fetchTeacherStudentAssessmentsPaginated({
        studentId,
        pageSize = 5,
        cursorDoc = null,
    } = {}) {
        if (shouldFail) throw new Error("Firestore connection unavailable");
        const user = authState.currentUser;
        if (!user) throw new Error("Authentication required to view student assessment history.");
        if (!studentId) throw new Error("Student ID is required.");

        const teacherData = users[user.uid];
        if (
            !teacherData ||
            teacherData.role !== "teacher" ||
            teacherData.approvalStatus !== "approved" ||
            teacherData.accountStatus === "suspended"
        ) {
            throw new Error("Unauthorized: Only approved teachers may view student assessment records.");
        }

        const permData = permissions[studentId];
        if (!permData || !permData.teacherAccess) {
            throw new Error("Unauthorized: This student has not granted teacher access permissions.");
        }

        const safeLimit = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));
        let filtered = assessments.filter((a) => (a.data ? a.data().userId : a.userId) === studentId);
        filtered.sort((a, b) => {
            const timeA = a.data ? a.data().completedAt : a.completedAt;
            const timeB = b.data ? b.data().completedAt : b.completedAt;
            return timeB - timeA;
        });

        let startIndex = 0;
        if (cursorDoc) {
            const cursorId = cursorDoc.id || cursorDoc;
            const idx = filtered.findIndex((d) => (d.id || d.data?.().id) === cursorId);
            if (idx !== -1) startIndex = idx + 1;
        }

        const slice = filtered.slice(startIndex, startIndex + safeLimit + 1);
        const hasNext = slice.length > safeLimit;
        const pageDocs = hasNext ? slice.slice(0, safeLimit) : slice;
        const nextCursorDoc = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

        const results = pageDocs.map((docSnap) => sanitizeStudentAssessment(docSnap));
        return { assessments: results, hasNext, nextCursorDoc, count: results.length };
    }

    async function fetchTeacherStudentProgressTimeline(studentId) {
        if (shouldFail) throw new Error("Firestore connection unavailable");
        const user = authState.currentUser;
        if (!user) throw new Error("Authentication required to view student progress trends.");
        if (!studentId) throw new Error("Student ID is required.");

        const teacherData = users[user.uid];
        if (
            !teacherData ||
            teacherData.role !== "teacher" ||
            teacherData.approvalStatus !== "approved" ||
            teacherData.accountStatus === "suspended"
        ) {
            throw new Error("Unauthorized: Only approved teachers may view student progress trends.");
        }

        const permData = permissions[studentId];
        if (!permData || !permData.teacherAccess) {
            throw new Error("Unauthorized: This student has not granted teacher access permissions.");
        }

        let filtered = assessments.filter((a) => (a.data ? a.data().userId : a.userId) === studentId);
        filtered.sort((a, b) => {
            const timeA = a.data ? a.data().completedAt : a.completedAt;
            const timeB = b.data ? b.data().completedAt : b.completedAt;
            return timeB - timeA;
        });

        const recent20 = filtered.slice(0, 20);
        const mapped = recent20.map((docSnap) => {
            const item = sanitizeStudentAssessment(docSnap);
            return {
                id: item.id,
                completedAt: item.completedAt,
                score: item.score,
                accuracy: item.accuracy,
                risk: item.risk,
                mlRisk: item.mlRisk,
                subScores: item.subScores,
            };
        });

        return mapped.reverse();
    }

    async function fetchParentChildAssessmentsPaginated({
        childId,
        pageSize = 5,
        cursorDoc = null,
    } = {}) {
        if (shouldFail) throw new Error("Firestore connection unavailable");
        const user = authState.currentUser;
        if (!user || !user.email) throw new Error("Authentication required to view child assessment history.");
        if (!childId) throw new Error("Child ID is required.");

        const parentData = users[user.uid];
        if (
            !parentData ||
            parentData.role !== "parent" ||
            parentData.approvalStatus !== "approved" ||
            parentData.accountStatus === "suspended"
        ) {
            throw new Error("Unauthorized: Only approved parents may view child assessment records.");
        }

        const childData = users[childId];
        if (
            !childData ||
            childData.role !== "student" ||
            !childData.parentEmail ||
            childData.parentEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()
        ) {
            throw new Error("Unauthorized: You can only access assessment records for your linked child.");
        }

        const safeLimit = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));
        let filtered = assessments.filter((a) => (a.data ? a.data().userId : a.userId) === childId);
        filtered.sort((a, b) => {
            const timeA = a.data ? a.data().completedAt : a.completedAt;
            const timeB = b.data ? b.data().completedAt : b.completedAt;
            return timeB - timeA;
        });

        let startIndex = 0;
        if (cursorDoc) {
            const cursorId = cursorDoc.id || cursorDoc;
            const idx = filtered.findIndex((d) => (d.id || d.data?.().id) === cursorId);
            if (idx !== -1) startIndex = idx + 1;
        }

        const slice = filtered.slice(startIndex, startIndex + safeLimit + 1);
        const hasNext = slice.length > safeLimit;
        const pageDocs = hasNext ? slice.slice(0, safeLimit) : slice;
        const nextCursorDoc = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

        const results = pageDocs.map((docSnap) => sanitizeStudentAssessment(docSnap));
        return { assessments: results, hasNext, nextCursorDoc, count: results.length };
    }

    async function fetchParentChildProgressTimeline(childId) {
        if (shouldFail) throw new Error("Firestore connection unavailable");
        const user = authState.currentUser;
        if (!user || !user.email) throw new Error("Authentication required to view child progress trends.");
        if (!childId) throw new Error("Child ID is required.");

        const parentData = users[user.uid];
        if (
            !parentData ||
            parentData.role !== "parent" ||
            parentData.approvalStatus !== "approved" ||
            parentData.accountStatus === "suspended"
        ) {
            throw new Error("Unauthorized: Only approved parents may view child progress trends.");
        }

        const childData = users[childId];
        if (
            !childData ||
            childData.role !== "student" ||
            !childData.parentEmail ||
            childData.parentEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()
        ) {
            throw new Error("Unauthorized: You can only view progress trends for your linked child.");
        }

        let filtered = assessments.filter((a) => (a.data ? a.data().userId : a.userId) === childId);
        filtered.sort((a, b) => {
            const timeA = a.data ? a.data().completedAt : a.completedAt;
            const timeB = b.data ? b.data().completedAt : b.completedAt;
            return timeB - timeA;
        });

        const recent20 = filtered.slice(0, 20);
        const mapped = recent20.map((docSnap) => {
            const item = sanitizeStudentAssessment(docSnap);
            return {
                id: item.id,
                completedAt: item.completedAt,
                score: item.score,
                accuracy: item.accuracy,
                risk: item.risk,
                mlRisk: item.mlRisk,
                subScores: item.subScores,
            };
        });

        return mapped.reverse();
    }

    return {
        fetchTeacherStudentAssessmentsPaginated,
        fetchTeacherStudentProgressTimeline,
        fetchParentChildAssessmentsPaginated,
        fetchParentChildProgressTimeline,
    };
}

// ── Test Runner ───────────────────────────────────────────────────────────────

async function runAllTests() {
    console.log("=======================================================================");
    console.log("  Running Phase 6.4 Teacher and Parent Assessment Views Test Suite");
    console.log("=======================================================================\n");

    const sampleUsers = {
        "teacher-approved": { role: "teacher", approvalStatus: "approved", accountStatus: "active" },
        "teacher-pending": { role: "teacher", approvalStatus: "pending", accountStatus: "active" },
        "teacher-suspended": { role: "teacher", approvalStatus: "approved", accountStatus: "suspended" },
        "parent-approved": { role: "parent", approvalStatus: "approved", accountStatus: "active" },
        "parent-pending": { role: "parent", approvalStatus: "pending", accountStatus: "active" },
        "parent-suspended": { role: "parent", approvalStatus: "approved", accountStatus: "suspended" },
        "student-with-consent": { role: "student", parentEmail: "parent1@example.com" },
        "student-no-consent": { role: "student", parentEmail: "parent2@example.com" },
        "other-user": { role: "teacher", parentEmail: "parent1@example.com" },
    };

    const samplePermissions = {
        "student-with-consent": { teacherAccess: true },
        "student-no-consent": { teacherAccess: false },
    };

    const sampleAssessments = [
        {
            id: "asmt-t1",
            data: () => ({
                userId: "student-with-consent",
                score: 85,
                accuracy: 90,
                risk: "Low Risk",
                mlRisk: "Low Risk",
                completedAt: 1732000000000,
                rawAudioBlob: "secret-audio-blob",
                authToken: "super-secret-token",
            }),
        },
        {
            id: "asmt-t2",
            data: () => ({
                userId: "student-with-consent",
                score: 75,
                accuracy: 80,
                risk: "Moderate Risk",
                mlRisk: "Moderate Risk",
                completedAt: 1732010000000,
            }),
        },
        {
            id: "asmt-noconsent-1",
            data: () => ({
                userId: "student-no-consent",
                score: 95,
                accuracy: 98,
                completedAt: 1732020000000,
            }),
        },
    ];

    // 1. Teacher Authorization Tests
    await testAsync("Teacher Auth: Rejects unauthenticated caller", async () => {
        const env = createMockEnvironment({ currentUser: null, users: sampleUsers });
        await assert.rejects(
            async () => env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-with-consent" }),
            /Authentication required/
        );
    });

    await testAsync("Teacher Auth: Rejects unapproved or pending teacher", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-pending" },
            users: sampleUsers,
            permissions: samplePermissions,
        });
        await assert.rejects(
            async () => env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-with-consent" }),
            /Only approved teachers may view student assessment records/
        );
    });

    await testAsync("Teacher Auth: Rejects suspended teacher", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-suspended" },
            users: sampleUsers,
            permissions: samplePermissions,
        });
        await assert.rejects(
            async () => env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-with-consent" }),
            /Only approved teachers may view student assessment records/
        );
    });

    await testAsync("Teacher Consent: Rejects read if student has not granted teacherAccess", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-approved" },
            users: sampleUsers,
            permissions: samplePermissions,
            assessments: sampleAssessments,
        });
        await assert.rejects(
            async () => env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-no-consent" }),
            /has not granted teacher access permissions/i
        );
    });

    await testAsync("Teacher Consent: Rejects timeline if student has not granted teacherAccess", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-approved" },
            users: sampleUsers,
            permissions: samplePermissions,
            assessments: sampleAssessments,
        });
        await assert.rejects(
            async () => env.fetchTeacherStudentProgressTimeline("student-no-consent"),
            /has not granted teacher access permissions/i
        );
    });

    await testAsync("Teacher Access: Permits approved teacher when student granted teacherAccess", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-approved" },
            users: sampleUsers,
            permissions: samplePermissions,
            assessments: sampleAssessments,
        });
        const res = await env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-with-consent" });
        assert.strictEqual(res.count, 2);
        assert.strictEqual(res.assessments[0].id, "asmt-t2"); // DESC order
        assert.strictEqual(res.assessments[1].id, "asmt-t1");
    });

    // 2. Parent-Child Relationship & Isolation Tests
    await testAsync("Parent Auth: Rejects unauthenticated caller", async () => {
        const env = createMockEnvironment({ currentUser: null, users: sampleUsers });
        await assert.rejects(
            async () => env.fetchParentChildAssessmentsPaginated({ childId: "student-with-consent" }),
            /Authentication required/
        );
    });

    await testAsync("Parent Auth: Rejects unapproved parent", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-pending", email: "parent1@example.com" },
            users: sampleUsers,
        });
        await assert.rejects(
            async () => env.fetchParentChildAssessmentsPaginated({ childId: "student-with-consent" }),
            /Only approved parents may view child assessment records/
        );
    });

    await testAsync("Parent Isolation: Rejects parent trying to access an unrelated student", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-approved", email: "parent1@example.com" },
            users: sampleUsers,
            assessments: sampleAssessments,
        });
        // student-no-consent has parentEmail: "parent2@example.com"
        await assert.rejects(
            async () => env.fetchParentChildAssessmentsPaginated({ childId: "student-no-consent" }),
            /You can only access assessment records for your linked child/
        );
    });

    await testAsync("Parent Isolation: Rejects if target user is not a student", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-approved", email: "parent1@example.com" },
            users: sampleUsers,
            assessments: sampleAssessments,
        });
        // other-user has matching parentEmail but role === "teacher"
        await assert.rejects(
            async () => env.fetchParentChildAssessmentsPaginated({ childId: "other-user" }),
            /You can only access assessment records for your linked child/
        );
    });

    await testAsync("Parent Linking: Safely handles case-insensitive parent emails", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-approved", email: "Parent1@EXAMPLE.COM" },
            users: sampleUsers,
            assessments: sampleAssessments,
        });
        const res = await env.fetchParentChildAssessmentsPaginated({ childId: "student-with-consent" });
        assert.strictEqual(res.count, 2);
    });

    await testAsync("Parent Timeline: Rejects timeline if parent is not linked to child", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-approved", email: "unrelated@example.com" },
            users: sampleUsers,
            assessments: sampleAssessments,
        });
        await assert.rejects(
            async () => env.fetchParentChildProgressTimeline("student-with-consent"),
            /You can only view progress trends for your linked child/
        );
    });

    await testAsync("Parent Timeline: Permits timeline for linked child and returns chronological ASC", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-approved", email: "parent1@example.com" },
            users: sampleUsers,
            assessments: sampleAssessments,
        });
        const timeline = await env.fetchParentChildProgressTimeline("student-with-consent");
        assert.strictEqual(timeline.length, 2);
        // Chronological order: asmt-t1 (timestamp 1732000000000) then asmt-t2 (1732010000000)
        assert.strictEqual(timeline[0].id, "asmt-t1");
        assert.strictEqual(timeline[1].id, "asmt-t2");
        assert.strictEqual(timeline[0].score, 85);
        assert.strictEqual(timeline[1].score, 75);
    });

    // 3. Privacy Boundary & Data Sanitization Tests
    await testAsync("Privacy: Strips raw audio data, waveforms, and tokens for teacher and parent", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-approved" },
            users: sampleUsers,
            permissions: samplePermissions,
            assessments: sampleAssessments,
        });
        const res = await env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-with-consent" });
        const asmt1 = res.assessments.find((a) => a.id === "asmt-t1");
        assert.ok(asmt1, "asmt-t1 must be retrieved");
        assert.strictEqual(asmt1.rawAudioBlob, undefined, "rawAudioBlob must be stripped");
        assert.strictEqual(asmt1.authToken, undefined, "authToken must be stripped");
        assert.strictEqual(asmt1.score, 85);
        assert.strictEqual(asmt1.accuracy, 90);
    });

    // 4. Cursor Pagination Tests
    await testAsync("Pagination: Slices pages correctly with nextCursorDoc for teacher queries", async () => {
        const bulkAssessments = Array.from({ length: 8 }, (_, i) => ({
            id: `bulk-t-${i}`,
            data: () => ({
                id: `bulk-t-${i}`,
                userId: "student-with-consent",
                score: 70 + i,
                completedAt: 1000 + i * 100,
            }),
        }));

        const env = createMockEnvironment({
            currentUser: { uid: "teacher-approved" },
            users: sampleUsers,
            permissions: samplePermissions,
            assessments: bulkAssessments,
        });

        const p1 = await env.fetchTeacherStudentAssessmentsPaginated({
            studentId: "student-with-consent",
            pageSize: 3,
        });
        assert.strictEqual(p1.count, 3);
        assert.strictEqual(p1.hasNext, true);
        assert.ok(p1.nextCursorDoc);

        const p2 = await env.fetchTeacherStudentAssessmentsPaginated({
            studentId: "student-with-consent",
            pageSize: 3,
            cursorDoc: p1.nextCursorDoc,
        });
        assert.strictEqual(p2.count, 3);
        assert.strictEqual(p2.hasNext, true);

        const p3 = await env.fetchTeacherStudentAssessmentsPaginated({
            studentId: "student-with-consent",
            pageSize: 3,
            cursorDoc: p2.nextCursorDoc,
        });
        assert.strictEqual(p3.count, 2);
        assert.strictEqual(p3.hasNext, false);
        assert.strictEqual(p3.nextCursorDoc, null);
    });

    // 5. Empty State & Failure Resilience Tests
    await testAsync("Empty State: Returns clean empty array when student has zero assessments", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "teacher-approved" },
            users: sampleUsers,
            permissions: samplePermissions,
            assessments: [],
        });
        const res = await env.fetchTeacherStudentAssessmentsPaginated({ studentId: "student-with-consent" });
        assert.strictEqual(res.count, 0);
        assert.strictEqual(res.hasNext, false);
        assert.deepStrictEqual(res.assessments, []);

        const timeline = await env.fetchTeacherStudentProgressTimeline("student-with-consent");
        assert.deepStrictEqual(timeline, []);
    });

    await testAsync("Resilience: Propagates connection error for UI retry banner", async () => {
        const env = createMockEnvironment({
            currentUser: { uid: "parent-approved", email: "parent1@example.com" },
            users: sampleUsers,
            shouldFail: true,
        });
        await assert.rejects(
            async () => env.fetchParentChildAssessmentsPaginated({ childId: "student-with-consent" }),
            /Firestore connection unavailable/
        );
    });

    // ── Summary ───────────────────────────────────────────────────────────────────
    console.log("\n=======================================================================");
    console.log(`  Phase 6.4 Teacher/Parent History Test Results: ${passed} passed, ${failed} failed`);
    console.log("=======================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch((err) => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});
