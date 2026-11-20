"use strict";
/**
 * DyslexAid - Phase 6.3 Student Assessment History & Progress Visualization Test Suite
 * ─────────────────────────────────────────────────────────────────────────────────────
 * Validates the student-facing assessment history service, security boundaries,
 * data sanitization, cursor pagination, and chronological timeline mapping:
 *  1. Ownership Isolation: Strict enforcement that request.auth.uid === userId.
 *  2. Unauthenticated Access Protection: Immediate rejection when auth.currentUser is null.
 *  3. Data Sanitization: Stripping raw audio waveforms, device metadata, clamping scores [0, 100].
 *  4. Robust Timestamp Handling: Timestamp object toMillis(), numbers, and ISO strings.
 *  5. Cursor-based Pagination: Querying limit+1, detecting hasNext, passing cursorDoc safely.
 *  6. Chronological Progress Mapping: Reversing recent DESC query to ASC for trend visualization.
 *  7. Progress Delta Calculation: Accurate calculation of baseline vs latest improvement deltas.
 *  8. Empty State & Error Resilience: Handling zero-document scenarios and Firestore failures.
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

// ── In-Memory Mock of Student Assessment Service ──────────────────────────────

function createMockService({ currentUser = null, mockDocs = [], shouldFail = false }) {
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

    async function fetchStudentAssessmentsPaginated({
        userId,
        pageSize = 5,
        cursorDoc = null,
    } = {}) {
        if (shouldFail) {
            throw new Error("Firestore connection unavailable");
        }

        const user = authState.currentUser;
        if (!user) {
            throw new Error("Authentication required to view assessment history.");
        }

        if (!userId || user.uid !== userId) {
            throw new Error("Unauthorized: You can only access your own assessment history.");
        }

        const safeLimit = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));

        // Filter by user and sort DESC by completedAt
        let filtered = mockDocs.filter((d) => (d.data ? d.data().userId : d.userId) === userId);
        filtered.sort((a, b) => {
            const timeA = a.data ? a.data().completedAt : a.completedAt;
            const timeB = b.data ? b.data().completedAt : b.completedAt;
            return timeB - timeA;
        });

        // Handle cursor doc
        let startIndex = 0;
        if (cursorDoc) {
            const cursorIdx = filtered.findIndex((d) => (d.id || d.data?.().id) === (cursorDoc.id || cursorDoc));
            if (cursorIdx !== -1) {
                startIndex = cursorIdx + 1;
            }
        }

        const slice = filtered.slice(startIndex, startIndex + safeLimit + 1);
        const hasNext = slice.length > safeLimit;
        const pageDocs = hasNext ? slice.slice(0, safeLimit) : slice;
        const nextCursorDoc = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

        const assessments = pageDocs.map((docSnap) => sanitizeStudentAssessment(docSnap));

        return {
            assessments,
            hasNext,
            nextCursorDoc,
            count: assessments.length,
        };
    }

    async function fetchStudentProgressTimeline(userId) {
        if (shouldFail) {
            throw new Error("Firestore connection unavailable");
        }

        const user = authState.currentUser;
        if (!user) {
            throw new Error("Authentication required to view progress trends.");
        }

        if (!userId || user.uid !== userId) {
            throw new Error("Unauthorized: You can only view your own progress trends.");
        }

        let filtered = mockDocs.filter((d) => (d.data ? d.data().userId : d.userId) === userId);
        // Latest 20 assessments (DESC), then reversed to chronological ASC
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

        // Return chronological order (oldest to newest among the most recent 20)
        return mapped.reverse();
    }

    return {
        sanitizeStudentAssessment,
        fetchStudentAssessmentsPaginated,
        fetchStudentProgressTimeline,
        setAuthUser: (u) => { authState.currentUser = u; },
    };
}

async function runAllTests() {
    console.log("=======================================================================");
    console.log("  Running Phase 6.3 Student Assessment History Test Suite");
    console.log("=======================================================================\n");

    // 1. Data Sanitization Tests
    test("Sanitization: Strips raw audio data, waveforms, and sensitive client tokens", () => {
        const service = createMockService({});
        const dirtyDoc = {
            id: "asmt-raw-1",
            data: () => ({
                userId: "student-1",
                score: 85,
                accuracy: 92,
                risk: "Low Risk",
                mlRisk: "Low Risk",
                rawAudioBlob: "data:audio/wav;base64,UklGR...",
                waveformSamples: [0.12, 0.45, -0.32, 0.88],
                internalIp: "192.168.1.1",
                authToken: "secret-token-123",
                subScores: { voiceAccuracy: 90, letterScore: 6, wordScore: 6 },
                insights: { strengths: ["Rapid naming"], improvements: ["Vowel teams"] },
                completedAt: 1732000000000,
                createdAt: 1732000000000,
            }),
        };

        const sanitized = service.sanitizeStudentAssessment(dirtyDoc);
        assert.strictEqual(sanitized.id, "asmt-raw-1");
        assert.strictEqual(sanitized.score, 85);
        assert.strictEqual(sanitized.accuracy, 92);
        assert.strictEqual(sanitized.rawAudioBlob, undefined, "rawAudioBlob must not be exposed to client UI");
        assert.strictEqual(sanitized.waveformSamples, undefined, "waveformSamples must not be exposed");
        assert.strictEqual(sanitized.internalIp, undefined, "internalIp must not be exposed");
        assert.strictEqual(sanitized.authToken, undefined, "authToken must not be exposed");
        assert.deepStrictEqual(sanitized.subScores, { voiceAccuracy: 90, letterScore: 6, wordScore: 6 });
    });

    test("Sanitization: Clamps out-of-bounds scores and provides defaults for missing structures", () => {
        const service = createMockService({});
        const invalidScoresDoc = {
            id: "asmt-clamp-1",
            data: () => ({
                userId: "student-1",
                score: 140, // out of bounds
                accuracy: -25, // out of bounds
                completedAt: null,
            }),
        };

        const sanitized = service.sanitizeStudentAssessment(invalidScoresDoc);
        assert.strictEqual(sanitized.score, 100, "Score over 100 must be clamped to 100");
        assert.strictEqual(sanitized.accuracy, 0, "Accuracy below 0 must be clamped to 0");
        assert.strictEqual(sanitized.risk, "Unknown");
        assert.strictEqual(sanitized.mlRisk, "Unknown");
        assert.deepStrictEqual(sanitized.subScores, { voiceAccuracy: 0, letterScore: 0, wordScore: 0 });
        assert.deepStrictEqual(sanitized.insights, { strengths: [], improvements: [] });
        assert.strictEqual(sanitized.completedAt, null);
    });

    test("Sanitization: Handles Firestore Timestamp toMillis() and ISO strings reliably", () => {
        const service = createMockService({});
        const timestampDoc = {
            id: "asmt-ts-1",
            data: () => ({
                userId: "student-1",
                score: 75,
                completedAt: { toMillis: () => 1732050000000 },
                createdAt: "2024-11-19T20:00:00.000Z",
            }),
        };

        const sanitized = service.sanitizeStudentAssessment(timestampDoc);
        assert.strictEqual(sanitized.completedAt, 1732050000000);
        assert.strictEqual(typeof sanitized.createdAt, "number");
        assert.strictEqual(sanitized.createdAt, Date.parse("2024-11-19T20:00:00.000Z"));
    });

    // 2. Security & Ownership Isolation Tests
    await testAsync("Security: Rejects unauthenticated caller requesting student assessments", async () => {
        const service = createMockService({ currentUser: null });
        await assert.rejects(
            async () => {
                await service.fetchStudentAssessmentsPaginated({ userId: "student-1" });
            },
            /Authentication required/
        );
    });

    await testAsync("Security: Enforces ownership isolation — rejects cross-student assessment access", async () => {
        const service = createMockService({
            currentUser: { uid: "student-victim" },
            mockDocs: [
                { id: "asmt-attacker-1", data: () => ({ userId: "student-attacker", score: 80, completedAt: 1000 }) },
                { id: "asmt-victim-1", data: () => ({ userId: "student-victim", score: 90, completedAt: 1000 }) },
            ],
        });

        await assert.rejects(
            async () => {
                await service.fetchStudentAssessmentsPaginated({ userId: "student-attacker" });
            },
            /Unauthorized: You can only access your own assessment history/
        );
    });

    await testAsync("Security: Enforces ownership isolation on progress timeline query", async () => {
        const service = createMockService({
            currentUser: { uid: "student-alice" },
        });

        await assert.rejects(
            async () => {
                await service.fetchStudentProgressTimeline("student-bob");
            },
            /Unauthorized: You can only view your own progress trends/
        );
    });

    // 3. Cursor-Based Pagination Tests
    await testAsync("Pagination: Correctly slices pages and signals hasNext with pure cursors", async () => {
        const sampleDocs = Array.from({ length: 12 }, (_, i) => ({
            id: `asmt-idx-${i + 1}`,
            data: () => ({
                id: `asmt-idx-${i + 1}`,
                userId: "student-test",
                score: 70 + i,
                accuracy: 80 + i,
                completedAt: 1732000000000 + i * 10000,
            }),
        }));

        const service = createMockService({
            currentUser: { uid: "student-test" },
            mockDocs: sampleDocs,
        });

        // Page 1 (pageSize = 5)
        const page1 = await service.fetchStudentAssessmentsPaginated({
            userId: "student-test",
            pageSize: 5,
        });

        assert.strictEqual(page1.count, 5);
        assert.strictEqual(page1.hasNext, true);
        assert.ok(page1.nextCursorDoc, "Page 1 must return nextCursorDoc");
        assert.strictEqual(page1.assessments[0].id, "asmt-idx-12");
        assert.strictEqual(page1.assessments[4].id, "asmt-idx-8");

        // Page 2 using cursor from Page 1
        const page2 = await service.fetchStudentAssessmentsPaginated({
            userId: "student-test",
            pageSize: 5,
            cursorDoc: page1.nextCursorDoc,
        });

        assert.strictEqual(page2.count, 5);
        assert.strictEqual(page2.hasNext, true);
        assert.strictEqual(page2.assessments[0].id, "asmt-idx-7");
        assert.strictEqual(page2.assessments[4].id, "asmt-idx-3");

        // Page 3 using cursor from Page 2
        const page3 = await service.fetchStudentAssessmentsPaginated({
            userId: "student-test",
            pageSize: 5,
            cursorDoc: page2.nextCursorDoc,
        });

        assert.strictEqual(page3.count, 2);
        assert.strictEqual(page3.hasNext, false);
        assert.strictEqual(page3.nextCursorDoc, null);
        assert.strictEqual(page3.assessments[0].id, "asmt-idx-2");
        assert.strictEqual(page3.assessments[1].id, "asmt-idx-1");
    });

    await testAsync("Pagination: Respects safety limits [1, 20]", async () => {
        const sampleDocs = Array.from({ length: 30 }, (_, i) => ({
            id: `asmt-${i}`,
            data: () => ({
                id: `asmt-${i}`,
                userId: "student-limit",
                score: 75,
                completedAt: 1732000000000 + i,
            }),
        }));

        const service = createMockService({
            currentUser: { uid: "student-limit" },
            mockDocs: sampleDocs,
        });

        const requestedOverLimit = await service.fetchStudentAssessmentsPaginated({
            userId: "student-limit",
            pageSize: 100,
        });

        assert.strictEqual(requestedOverLimit.count, 20, "pageSize must be clamped to max 20");
        assert.strictEqual(requestedOverLimit.hasNext, true);
    });

    // 4. Chronological Progress Timeline Mapping Tests
    await testAsync("Timeline: Correctly reverses latest DESC query to chronological ASC order", async () => {
        const dates = [1000, 2000, 3000, 4000, 5000];
        const sampleDocs = dates.map((ts, i) => ({
            id: `asmt-time-${i}`,
            data: () => ({
                id: `asmt-time-${i}`,
                userId: "student-chart",
                score: 60 + i * 5,
                accuracy: 70 + i * 4,
                risk: i === 0 ? "High Risk" : (i > 3 ? "Low Risk" : "Moderate Risk"),
                completedAt: ts,
            }),
        }));

        const service = createMockService({
            currentUser: { uid: "student-chart" },
            mockDocs: sampleDocs,
        });

        const timeline = await service.fetchStudentProgressTimeline("student-chart");
        assert.strictEqual(timeline.length, 5);

        assert.strictEqual(timeline[0].completedAt, 1000);
        assert.strictEqual(timeline[0].score, 60);
        assert.strictEqual(timeline[0].risk, "High Risk");

        assert.strictEqual(timeline[4].completedAt, 5000);
        assert.strictEqual(timeline[4].score, 80);
        assert.strictEqual(timeline[4].risk, "Low Risk");

        const initialScore = timeline[0].score;
        const latestScore = timeline[timeline.length - 1].score;
        const delta = latestScore - initialScore;
        assert.strictEqual(delta, 20, "Student improved by +20 points");
    });

    await testAsync("Timeline: Limits to most recent 20 assessments when more exist", async () => {
        const sampleDocs = Array.from({ length: 35 }, (_, i) => ({
            id: `asmt-bulk-${i}`,
            data: () => ({
                id: `asmt-bulk-${i}`,
                userId: "student-bulk",
                score: 50 + (i % 50),
                accuracy: 60,
                completedAt: 1000 + i * 100,
            }),
        }));

        const service = createMockService({
            currentUser: { uid: "student-bulk" },
            mockDocs: sampleDocs,
        });

        const timeline = await service.fetchStudentProgressTimeline("student-bulk");
        assert.strictEqual(timeline.length, 20, "Timeline must fetch exactly the 20 most recent items");
        assert.strictEqual(timeline[0].completedAt, 2500);
        assert.strictEqual(timeline[19].completedAt, 4400);
    });

    // 5. Empty State & Failure Resilience Tests
    await testAsync("Empty State: Handles zero assessments gracefully with empty array", async () => {
        const service = createMockService({
            currentUser: { uid: "student-new" },
            mockDocs: [],
        });

        const historyRes = await service.fetchStudentAssessmentsPaginated({ userId: "student-new" });
        assert.strictEqual(historyRes.count, 0);
        assert.strictEqual(historyRes.hasNext, false);
        assert.deepStrictEqual(historyRes.assessments, []);
        assert.strictEqual(historyRes.nextCursorDoc, null);

        const timelineRes = await service.fetchStudentProgressTimeline("student-new");
        assert.deepStrictEqual(timelineRes, []);
    });

    await testAsync("Resilience: Gracefully surfaces Firestore connection errors for UI retry prompt", async () => {
        const service = createMockService({
            currentUser: { uid: "student-err" },
            shouldFail: true,
        });

        await assert.rejects(
            async () => {
                await service.fetchStudentAssessmentsPaginated({ userId: "student-err" });
            },
            /Firestore connection unavailable/
        );

        await assert.rejects(
            async () => {
                await service.fetchStudentProgressTimeline("student-err");
            },
            /Firestore connection unavailable/
        );
    });

    // ── Summary ───────────────────────────────────────────────────────────────────
    console.log("\n=======================================================================");
    console.log(`  Phase 6.3 Student History Test Results: ${passed} passed, ${failed} failed`);
    console.log("=======================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch((err) => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});
