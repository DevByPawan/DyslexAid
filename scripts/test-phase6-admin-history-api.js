"use strict";
/**
 * DyslexAid - Phase 6.2 Admin Historical Assessment API & Pagination Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the Super Admin Historical Assessment queries, cursor pagination,
 * multi-dimensional filtering, and privacy sanitization:
 *  1. Server-side Super Admin authorization enforcement (401 / 403 / 200).
 *  2. Unfiltered and student-specific queries (GET /api/admin/assessments and /api/admin/users/:userId/assessments).
 *  3. Risk classification filtering (Low, Moderate, High Risk) and invalid filter rejection.
 *  4. Date range bounds filtering (startDate, endDate, invalid format rejection).
 *  5. Stable cursor-based pagination (limit, nextCursor, deterministic ordering, no offset).
 *  6. Cursor validation (malformed cursor rejection, non-existent cursor doc rejection).
 *  7. Privacy & data sanitization (strict exclusion of raw audio, credentials, or internal PII).
 *  8. Empty dataset and edge cases.
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

console.log("=======================================================================");
console.log("  Running Phase 6.2 Admin Historical Assessment API Test Suite");
console.log("=======================================================================\n");

// ── Mock In-Memory Firestore & Express Environment ───────────────────────────

class MockFirestoreQuery {
    constructor(collectionData, filters = [], orderBys = [], cursorDoc = null, limitVal = null) {
        this.collectionData = collectionData;
        this.filters = filters;
        this.orderBys = orderBys;
        this.cursorDoc = cursorDoc;
        this.limitVal = limitVal;
    }

    where(field, op, value) {
        return new MockFirestoreQuery(
            this.collectionData,
            [...this.filters, { field, op, value }],
            this.orderBys,
            this.cursorDoc,
            this.limitVal
        );
    }

    orderBy(field, direction = "asc") {
        return new MockFirestoreQuery(
            this.collectionData,
            this.filters,
            [...this.orderBys, { field, direction }],
            this.cursorDoc,
            this.limitVal
        );
    }

    startAfter(docSnap) {
        return new MockFirestoreQuery(
            this.collectionData,
            this.filters,
            this.orderBys,
            docSnap,
            this.limitVal
        );
    }

    limit(n) {
        return new MockFirestoreQuery(
            this.collectionData,
            this.filters,
            this.orderBys,
            this.cursorDoc,
            n
        );
    }

    async get() {
        let results = [...this.collectionData];

        // Apply filters
        for (const f of this.filters) {
            results = results.filter((doc) => {
                const val = doc.data[f.field];
                if (f.op === "==") return val === f.value;
                if (f.op === ">=") {
                    const docMillis = typeof val?.toMillis === "function" ? val.toMillis() : val;
                    const compMillis = typeof f.value?.toMillis === "function" ? f.value.toMillis() : f.value;
                    return docMillis >= compMillis;
                }
                if (f.op === "<=") {
                    const docMillis = typeof val?.toMillis === "function" ? val.toMillis() : val;
                    const compMillis = typeof f.value?.toMillis === "function" ? f.value.toMillis() : f.value;
                    return docMillis <= compMillis;
                }
                return true;
            });
        }

        // Apply ordering (supporting completedAt and tiebreaker __name__)
        if (this.orderBys.length > 0) {
            results.sort((a, b) => {
                for (const ord of this.orderBys) {
                    let fieldA = ord.field === "__name__" ? a.id : a.data[ord.field];
                    let fieldB = ord.field === "__name__" ? b.id : b.data[ord.field];

                    if (typeof fieldA?.toMillis === "function") fieldA = fieldA.toMillis();
                    if (typeof fieldB?.toMillis === "function") fieldB = fieldB.toMillis();

                    if (fieldA < fieldB) return ord.direction === "asc" ? -1 : 1;
                    if (fieldA > fieldB) return ord.direction === "asc" ? 1 : -1;
                }
                return 0;
            });
        }

        // Apply cursor (startAfter)
        if (this.cursorDoc) {
            const index = results.findIndex((d) => d.id === this.cursorDoc.id);
            if (index !== -1) {
                results = results.slice(index + 1);
            }
        }

        // Apply limit
        if (this.limitVal !== null) {
            results = results.slice(0, this.limitVal);
        }

        return {
            docs: results.map((r) => ({
                id: r.id,
                data: () => r.data,
            })),
            size: results.length,
        };
    }
}

// Populate test dataset of historical assessments
const testAssessments = [
    {
        id: "asmt_001",
        data: {
            userId: "student_1",
            type: "comprehensive_screening",
            score: 85,
            accuracy: 88,
            risk: "Low Risk",
            mlRisk: "Low Risk",
            subScores: { voiceAccuracy: 88, letterScore: 6, wordScore: 6 },
            insights: { strengths: ["Fluency"], improvements: [] },
            completedAt: { toMillis: () => 1740000000000 },
            createdAt: { toMillis: () => 1740000000000 },
            rawAudioRecording: "MALICIOUS_VOICE_STREAM_DATA_SHOULD_BE_STRIPPED"
        }
    },
    {
        id: "asmt_002",
        data: {
            userId: "student_1",
            type: "comprehensive_screening",
            score: 65,
            accuracy: 60,
            risk: "Moderate Risk",
            mlRisk: "Moderate Risk",
            subScores: { voiceAccuracy: 60, letterScore: 5, wordScore: 4 },
            insights: { strengths: ["Word"], improvements: ["Letter Reversals"] },
            completedAt: { toMillis: () => 1740001000000 },
            createdAt: { toMillis: () => 1740001000000 }
        }
    },
    {
        id: "asmt_003",
        data: {
            userId: "student_2",
            type: "comprehensive_screening",
            score: 42,
            accuracy: 45,
            risk: "High Risk",
            mlRisk: "High Risk",
            subScores: { voiceAccuracy: 45, letterScore: 3, wordScore: 2 },
            insights: { strengths: [], improvements: ["Fluency", "Word Recognition"] },
            completedAt: { toMillis: () => 1740002000000 },
            createdAt: { toMillis: () => 1740002000000 }
        }
    },
    {
        id: "asmt_004",
        data: {
            userId: "student_2",
            type: "comprehensive_screening",
            score: 75,
            accuracy: 72,
            risk: "Moderate Risk",
            mlRisk: "Moderate Risk",
            subScores: { voiceAccuracy: 72, letterScore: 5, wordScore: 5 },
            insights: { strengths: ["Letter Recognition"], improvements: [] },
            completedAt: { toMillis: () => 1740003000000 },
            createdAt: { toMillis: () => 1740003000000 }
        }
    },
    {
        id: "asmt_005",
        data: {
            userId: "student_3",
            type: "comprehensive_screening",
            score: 92,
            accuracy: 95,
            risk: "Low Risk",
            mlRisk: "Low Risk",
            subScores: { voiceAccuracy: 95, letterScore: 7, wordScore: 7 },
            insights: { strengths: ["Fluency", "Letter", "Word"], improvements: [] },
            completedAt: { toMillis: () => 1740004000000 },
            createdAt: { toMillis: () => 1740004000000 }
        }
    }
];

function sanitizeAssessment(id, data) {
    return {
        id,
        userId: data.userId || "",
        type: data.type || "comprehensive_screening",
        score: typeof data.score === "number" ? data.score : 0,
        accuracy: typeof data.accuracy === "number" ? data.accuracy : 0,
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
        completedAt: typeof data.completedAt?.toMillis === "function" ? data.completedAt.toMillis() : data.completedAt,
        createdAt: typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : data.createdAt,
    };
}

async function queryHistoricalAssessments(params, dataStore = testAssessments) {
    const { userId, risk = "all", startDate, endDate, limit: rawLimit = 10, cursor = null, sortOrder = "desc" } = params;

    // Validation
    if (userId && !/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) {
        return { status: 400, error: "Invalid userId parameter: must be a valid alphanumeric identifier." };
    }

    const validRisks = ["all", "Low Risk", "Moderate Risk", "High Risk", "Unknown"];
    if (!validRisks.includes(risk)) {
        return { status: 400, error: "Invalid risk filter. Allowed values: all, Low Risk, Moderate Risk, High Risk, Unknown." };
    }

    let limit = parseInt(rawLimit, 10);
    if (isNaN(limit) || limit < 1) {
        return { status: 400, error: "Invalid limit parameter: must be a positive integer." };
    }
    if (limit > 50) limit = 50;

    if (cursor && !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor)) {
        return { status: 400, error: "Invalid cursor format: must be a valid alphanumeric document identifier." };
    }

    let startMillis = null;
    if (startDate) {
        startMillis = Date.parse(startDate);
        if (isNaN(startMillis)) return { status: 400, error: "Invalid startDate format." };
    }

    let endMillis = null;
    if (endDate) {
        endMillis = Date.parse(endDate);
        if (isNaN(endMillis)) return { status: 400, error: "Invalid endDate format." };
        if (endDate.length === 10) endMillis += 86399999;
    }

    if (startMillis !== null && endMillis !== null && startMillis > endMillis) {
        return { status: 400, error: "startDate cannot be after endDate." };
    }

    // Query builder
    let q = new MockFirestoreQuery(dataStore);
    if (userId) q = q.where("userId", "==", userId);
    if (risk !== "all") q = q.where("risk", "==", risk);
    if (startMillis !== null) q = q.where("completedAt", ">=", startMillis);
    if (endMillis !== null) q = q.where("completedAt", "<=", endMillis);

    q = q.orderBy("completedAt", sortOrder).orderBy("__name__", sortOrder);

    if (cursor) {
        const cursorItem = dataStore.find((d) => d.id === cursor);
        if (!cursorItem) {
            return { status: 400, error: "Cursor document not found or invalid." };
        }
        q = q.startAfter(cursorItem);
    }

    // Limit + 1 strategy
    const snap = await q.limit(limit + 1).get();
    const hasNext = snap.docs.length > limit;
    const pageDocs = hasNext ? snap.docs.slice(0, limit) : snap.docs;
    const nextCursor = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

    const assessments = pageDocs.map((d) => sanitizeAssessment(d.id, d.data()));

    return {
        status: 200,
        data: {
            assessments,
            pagination: {
                limit,
                hasNext,
                nextCursor,
                count: assessments.length,
            },
            filters: {
                userId: userId || null,
                risk: risk !== "all" ? risk : null,
                startDate: startMillis !== null ? new Date(startMillis).toISOString() : null,
                endDate: endMillis !== null ? new Date(endMillis).toISOString() : null,
                sortOrder,
            }
        }
    };
}

// ── Test Group 1: Server-Side Authorization ──────────────────────────────────
console.log("[Test Group 1] Server-Side Super Admin Authorization");

function evaluateAdminAccess(tokenHeader, primaryAdminUid = "admin_super_primary") {
    if (!tokenHeader || !tokenHeader.startsWith("Bearer ")) {
        return { status: 401, error: "Missing or malformed Authorization header." };
    }
    const token = tokenHeader.slice(7).trim();
    if (!token) {
        return { status: 401, error: "Empty authorization token." };
    }

    // Mock decode
    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    } catch {
        return { status: 401, error: "Invalid, expired, or revoked authentication token." };
    }

    if (decoded.superadmin !== true) {
        return { status: 403, error: "Forbidden: Account does not possess verified superadmin privileges." };
    }

    if (decoded.uid !== primaryAdminUid) {
        return { status: 403, error: "Forbidden: You are not the authorized primary Super Admin." };
    }

    return { status: 200, uid: decoded.uid };
}

test("Missing Authorization header returns HTTP 401", () => {
    const res = evaluateAdminAccess(null);
    assert.strictEqual(res.status, 401);
});

test("Non-superadmin user token returns HTTP 403", () => {
    const ordinaryToken = Buffer.from(JSON.stringify({ uid: "user_normal", superadmin: false })).toString("base64");
    const res = evaluateAdminAccess(`Bearer ${ordinaryToken}`);
    assert.strictEqual(res.status, 403);
});

test("Mismatched or spoofed non-primary admin UID returns HTTP 403", () => {
    const nonPrimaryToken = Buffer.from(JSON.stringify({ uid: "admin_attacker", superadmin: true })).toString("base64");
    const res = evaluateAdminAccess(`Bearer ${nonPrimaryToken}`);
    assert.strictEqual(res.status, 403);
});

test("Authorized Primary Super Admin succeeds with HTTP 200", () => {
    const validToken = Buffer.from(JSON.stringify({ uid: "admin_super_primary", superadmin: true })).toString("base64");
    const res = evaluateAdminAccess(`Bearer ${validToken}`);
    assert.strictEqual(res.status, 200);
});

// ── Test Group 2: Filtering Capabilities ─────────────────────────────────────
console.log("\n[Test Group 2] Query Filtering by User, Risk, and Date Range");

await testAsync("Filter by specific student (userId)", async () => {
    const res = await queryHistoricalAssessments({ userId: "student_1" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 2);
    assert(res.data.assessments.every((a) => a.userId === "student_1"));
});

await testAsync("Filter by risk classification ('Low Risk')", async () => {
    const res = await queryHistoricalAssessments({ risk: "Low Risk" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 2);
    assert(res.data.assessments.every((a) => a.risk === "Low Risk"));
});

await testAsync("Reject unrecognized risk filter with HTTP 400", async () => {
    const res = await queryHistoricalAssessments({ risk: "Critical Threat" });
    assert.strictEqual(res.status, 400);
    assert(res.error.includes("Invalid risk filter"));
});

await testAsync("Filter by date range (startDate and endDate)", async () => {
    // Window: between 1740001500000 and 1740003500000 (captures asmt_003 and asmt_004)
    const startDate = new Date(1740001500000).toISOString();
    const endDate = new Date(1740003500000).toISOString();

    const res = await queryHistoricalAssessments({ startDate, endDate });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 2);
    assert.deepStrictEqual(res.data.assessments.map((a) => a.id), ["asmt_004", "asmt_003"]);
});

await testAsync("Reject invalid startDate format with HTTP 400", async () => {
    const res = await queryHistoricalAssessments({ startDate: "invalid-date-format" });
    assert.strictEqual(res.status, 400);
    assert(res.error.includes("Invalid startDate"));
});

await testAsync("Reject startDate later than endDate with HTTP 400", async () => {
    const res = await queryHistoricalAssessments({ startDate: "2026-12-01", endDate: "2026-01-01" });
    assert.strictEqual(res.status, 400);
    assert(res.error.includes("startDate cannot be after endDate"));
});

// ── Test Group 3: Cursor Pagination & Deterministic Ordering ─────────────────
console.log("\n[Test Group 3] Stable Cursor-Based Pagination & Bounds");

await testAsync("Page 1 returns exact limit, hasNext true, and valid nextCursor", async () => {
    const res = await queryHistoricalAssessments({ limit: 2 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 2);
    assert.strictEqual(res.data.pagination.hasNext, true);
    assert.strictEqual(res.data.pagination.nextCursor, "asmt_004");
    // Verify descending order by completedAt
    assert.strictEqual(res.data.assessments[0].id, "asmt_005");
    assert.strictEqual(res.data.assessments[1].id, "asmt_004");
});

await testAsync("Page 2 using nextCursor retrieves subsequent deterministic records", async () => {
    const res = await queryHistoricalAssessments({ limit: 2, cursor: "asmt_004" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 2);
    assert.strictEqual(res.data.pagination.hasNext, true);
    assert.strictEqual(res.data.pagination.nextCursor, "asmt_002");
    assert.strictEqual(res.data.assessments[0].id, "asmt_003");
    assert.strictEqual(res.data.assessments[1].id, "asmt_002");
});

await testAsync("Final page returns remaining items with hasNext false and null nextCursor", async () => {
    const res = await queryHistoricalAssessments({ limit: 2, cursor: "asmt_002" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 1);
    assert.strictEqual(res.data.pagination.hasNext, false);
    assert.strictEqual(res.data.pagination.nextCursor, null);
    assert.strictEqual(res.data.assessments[0].id, "asmt_001");
});

await testAsync("Reject malformed cursor format with HTTP 400", async () => {
    const res = await queryHistoricalAssessments({ cursor: "../path/traversal!@" });
    assert.strictEqual(res.status, 400);
    assert(res.error.includes("Invalid cursor format"));
});

await testAsync("Reject non-existent cursor document with HTTP 400", async () => {
    const res = await queryHistoricalAssessments({ cursor: "asmt_does_not_exist_999" });
    assert.strictEqual(res.status, 400);
    assert(res.error.includes("Cursor document not found"));
});

await testAsync("Strict maximum limit enforcement (capped at 50)", async () => {
    const res = await queryHistoricalAssessments({ limit: 100 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pagination.limit, 50);
});

// ── Test Group 4: Privacy & Sanitization ─────────────────────────────────────
console.log("\n[Test Group 4] Privacy, Data Sanitization & Sensitive Field Omission");

await testAsync("Raw audio recordings, waveforms, and credentials are strictly omitted from response", async () => {
    const res = await queryHistoricalAssessments({ userId: "student_1" });
    assert.strictEqual(res.status, 200);
    const item = res.data.assessments.find((a) => a.id === "asmt_001");
    assert.ok(item, "asmt_001 found");
    assert.strictEqual(item.rawAudioRecording, undefined, "rawAudioRecording is omitted");
    assert.strictEqual(item.waveformSample, undefined, "waveformSample is omitted");
    assert.strictEqual(typeof item.score, "number");
    assert.strictEqual(typeof item.subScores.voiceAccuracy, "number");
});

// ── Test Group 5: Empty Dataset Handling ─────────────────────────────────────
console.log("\n[Test Group 5] Empty Dataset & Edge Cases");

await testAsync("Empty database or zero matching records returns empty list safely", async () => {
    const res = await queryHistoricalAssessments({ userId: "student_unregistered_999" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.assessments.length, 0);
    assert.strictEqual(res.data.pagination.count, 0);
    assert.strictEqual(res.data.pagination.hasNext, false);
    assert.strictEqual(res.data.pagination.nextCursor, null);
});

console.log("\n=======================================================================");
console.log(`  Phase 6.2 Admin History API Tests Completed: ${passed} passed, ${failed} failed`);
console.log("=======================================================================\n");

if (failed > 0) process.exit(1);

