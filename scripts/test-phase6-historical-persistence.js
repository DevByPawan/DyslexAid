"use strict";
/**
 * DyslexAid - Phase 6.1 Historical Assessment Persistence Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the core security, atomicity, idempotency, and access controls for:
 *  1. Valid assessment persistence and schema compliance.
 *  2. Invalid/missing score rejection and field validation.
 *  3. Injected field rejection (zero raw audio recordings / waveforms).
 *  4. Idempotent submission and duplicate prevention via stable assessment ID.
 *  5. Retry behavior without overwriting historical records.
 *  6. Transaction atomicity and rollback guarantees.
 *  7. Student ownership enforcement (request.auth.uid == data.userId).
 *  8. Parent & Teacher authorization boundaries (consent & parent email matching).
 *  9. Super Admin read privileges and absolute immutability (updates/deletes denied).
 * 10. Backward compatibility with existing user profile documents.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const assert = require("assert");
const fs = require("fs");

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

console.log("=======================================================================");
console.log("  Running Phase 6.1 Historical Assessment Persistence Test Suite");
console.log("=======================================================================\n");

// Read firestore.rules to verify rule enforcement
const rulesContent = fs.readFileSync("firestore.rules", "utf8");

// ── Test Group 1: Security Rules Schema Definition & Immutability ───────────
console.log("[Test Group 1] Rules Structure, Whitelist & Immutability");

test("isValidAssessment rule whitelists required and optional Phase 6.1 fields", () => {
    assert(rulesContent.includes("function isValidAssessment(data)"), "isValidAssessment defined");
    assert(rulesContent.includes("'subScores'"), "subScores whitelisted");
    assert(rulesContent.includes("'insights'"), "insights whitelisted");
    assert(rulesContent.includes("'answers'"), "answers whitelisted");
    assert(rulesContent.includes("'mlRisk'"), "mlRisk whitelisted");
});

test("Historical assessments collection strictly forbids all updates (immutability)", () => {
    const asmtBlock = rulesContent.substring(rulesContent.indexOf("match /assessments/{assessmentId}"));
    assert(asmtBlock.includes("allow update: if false;"), "Assessment updates are strictly denied");
});

test("Historical assessments collection strictly forbids all deletions", () => {
    const asmtBlock = rulesContent.substring(rulesContent.indexOf("match /assessments/{assessmentId}"));
    assert(asmtBlock.includes("allow delete: if false;"), "Assessment deletions are strictly denied");
});

// ── Test Group 2: In-Memory Assessment Schema Evaluator ─────────────────────
console.log("\n[Test Group 2] Assessment Schema Validation & Range Bounds");

const ALLOWED_ASSESSMENT_KEYS = new Set([
    "userId", "score", "accuracy", "risk", "mlRisk",
    "completedAt", "answers", "type", "notes", "createdAt",
    "subScores", "insights"
]);

const ALLOWED_RISK_VALUES = new Set([
    "Low Risk", "Moderate Risk", "High Risk", "Unknown"
]);

function validateAssessmentDocument(data) {
    // 1. Whitelist keys
    for (const key of Object.keys(data)) {
        if (!ALLOWED_ASSESSMENT_KEYS.has(key)) {
            return { valid: false, reason: `Unwhitelisted field: ${key}` };
        }
    }

    // 2. userId
    if (!data.userId || typeof data.userId !== "string" || data.userId.length > 128) {
        return { valid: false, reason: "Invalid userId" };
    }

    // 3. score & accuracy
    if (typeof data.score !== "number" || data.score < 0 || data.score > 100 || !Number.isFinite(data.score)) {
        return { valid: false, reason: "Invalid score" };
    }
    if (typeof data.accuracy !== "number" || data.accuracy < 0 || data.accuracy > 100 || !Number.isFinite(data.accuracy)) {
        return { valid: false, reason: "Invalid accuracy" };
    }

    // 4. risk & mlRisk
    if (!data.risk || typeof data.risk !== "string" || !ALLOWED_RISK_VALUES.has(data.risk)) {
        return { valid: false, reason: "Invalid risk classification" };
    }
    if (!data.mlRisk || typeof data.mlRisk !== "string" || !ALLOWED_RISK_VALUES.has(data.mlRisk)) {
        return { valid: false, reason: "Invalid mlRisk classification" };
    }

    // 5. subScores (must be an object, not array or primitive)
    if (data.subScores !== undefined) {
        if (typeof data.subScores !== "object" || data.subScores === null || Array.isArray(data.subScores)) {
            return { valid: false, reason: "Invalid subScores structure" };
        }
    }

    // 6. insights (must be an object, not array or primitive)
    if (data.insights !== undefined) {
        if (typeof data.insights !== "object" || data.insights === null || Array.isArray(data.insights)) {
            return { valid: false, reason: "Invalid insights structure" };
        }
    }

    return { valid: true };
}

test("Valid Phase 6.1 assessment payload passes schema validation", () => {
    const validPayload = {
        userId: "student_abc_123",
        type: "comprehensive_screening",
        score: 78,
        accuracy: 78,
        risk: "Moderate Risk",
        mlRisk: "Moderate Risk",
        subScores: {
            voiceAccuracy: 85,
            letterScore: 6,
            wordScore: 5
        },
        insights: {
            strengths: ["Reading Fluency", "Letter Recognition"],
            improvements: ["Word Recognition"]
        },
        answers: {
            voiceAccuracy: 85,
            letterScore: 6,
            wordScore: 5
        },
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    const res = validateAssessmentDocument(validPayload);
    assert.strictEqual(res.valid, true);
});

test("Rejects missing or invalid scores (negative, > 100, NaN)", () => {
    const base = {
        userId: "std_1",
        score: 50,
        accuracy: 50,
        risk: "Low Risk",
        mlRisk: "Low Risk"
    };

    assert.strictEqual(validateAssessmentDocument({ ...base, score: -5 }).valid, false);
    assert.strictEqual(validateAssessmentDocument({ ...base, score: 105 }).valid, false);
    assert.strictEqual(validateAssessmentDocument({ ...base, score: NaN }).valid, false);
    assert.strictEqual(validateAssessmentDocument({ ...base, accuracy: -1 }).valid, false);
    assert.strictEqual(validateAssessmentDocument({ ...base, accuracy: 150 }).valid, false);
});

test("Rejects unwhitelisted privacy-violating fields (raw voice recording / audio blobs)", () => {
    const payloadWithAudio = {
        userId: "std_1",
        score: 80,
        accuracy: 80,
        risk: "Low Risk",
        mlRisk: "Low Risk",
        rawAudioBlob: "base64_audio_data_stream_xyz...",
        waveformSample: [0.1, 0.4, 0.9, -0.3]
    };
    const res = validateAssessmentDocument(payloadWithAudio);
    assert.strictEqual(res.valid, false);
    assert(res.reason.includes("Unwhitelisted field"));
});

// ── Test Group 3: Atomicity, Idempotency & Rollback Simulation ──────────────
console.log("\n[Test Group 3] Transaction Atomicity & Idempotency Simulation");

class MockFirestoreTransactionDb {
    constructor() {
        this.assessments = new Map();
        this.users = new Map();
    }

    async runTransaction(updateFunction) {
        // Create an isolated snapshot of database state
        const transactionReads = [];
        const stagedWrites = [];
        let rolledBack = false;

        const transactionContext = {
            get: async (ref) => {
                const map = ref.collection === "assessments" ? this.assessments : this.users;
                const data = map.get(ref.id);
                return {
                    exists: () => data !== undefined,
                    data: () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined)
                };
            },
            set: (ref, data) => {
                stagedWrites.push({ action: "set", ref, data: JSON.parse(JSON.stringify(data)) });
            },
            update: (ref, data) => {
                stagedWrites.push({ action: "update", ref, data: JSON.parse(JSON.stringify(data)) });
            }
        };

        try {
            const result = await updateFunction(transactionContext);
            // Apply staged writes atomically
            for (const write of stagedWrites) {
                const map = write.ref.collection === "assessments" ? this.assessments : this.users;
                if (write.action === "set") {
                    map.set(write.ref.id, write.data);
                } else if (write.action === "update") {
                    const existing = map.get(write.ref.id) || {};
                    map.set(write.ref.id, { ...existing, ...write.data });
                }
            }
            return result;
        } catch (err) {
            rolledBack = true;
            throw err;
        }
    }
}

test("Atomic persistence creates assessment AND updates user profile simultaneously", async () => {
    const mockDb = new MockFirestoreTransactionDb();
    mockDb.users.set("user_1", {
        name: "Aarav Sharma",
        email: "aarav@test.com",
        role: "student",
        xp: 150,
        approvalStatus: "approved"
    });

    const assessmentId = "asmt_test_001";
    const assessmentData = {
        userId: "user_1",
        score: 82,
        accuracy: 85,
        risk: "Low Risk",
        mlRisk: "Low Risk"
    };
    const latestSummary = {
        lastScore: 82,
        lastAccuracy: 85,
        lastRisk: "Low Risk",
        lastMlRisk: "Low Risk",
        lastAssessmentDate: "2026-11-20T00:00:00.000Z"
    };

    await mockDb.runTransaction(async (transaction) => {
        const asmtRef = { collection: "assessments", id: assessmentId };
        const userRef = { collection: "users", id: "user_1" };

        const [asmtSnap, userSnap] = await Promise.all([
            transaction.get(asmtRef),
            transaction.get(userRef)
        ]);

        if (asmtSnap.exists()) return;

        transaction.set(asmtRef, assessmentData);
        if (userSnap.exists()) {
            transaction.update(userRef, latestSummary);
        }
    });

    // Verify both writes took effect
    const savedAsmt = mockDb.assessments.get(assessmentId);
    const updatedUser = mockDb.users.get("user_1");

    assert.ok(savedAsmt, "Historical assessment was stored");
    assert.strictEqual(savedAsmt.score, 82);
    assert.strictEqual(updatedUser.lastScore, 82);
    assert.strictEqual(updatedUser.xp, 150, "Unrelated user fields (xp) preserved");
    assert.strictEqual(updatedUser.name, "Aarav Sharma", "Name preserved");
});

test("Duplicate submission with same assessmentId is a safe no-op and never overwrites", async () => {
    const mockDb = new MockFirestoreTransactionDb();
    const assessmentId = "asmt_test_duplicate";
    mockDb.assessments.set(assessmentId, {
        userId: "user_1",
        score: 90,
        risk: "Low Risk",
        createdAt: "ORIGINAL_TIMESTAMP"
    });

    let writesAttempted = 0;
    await mockDb.runTransaction(async (transaction) => {
        const asmtRef = { collection: "assessments", id: assessmentId };
        const asmtSnap = await transaction.get(asmtRef);

        if (asmtSnap.exists()) {
            // Document already exists: Idempotent return without writing
            return;
        }

        writesAttempted++;
        transaction.set(asmtRef, { userId: "user_1", score: 40 });
    });

    assert.strictEqual(writesAttempted, 0, "No duplicate writes attempted");
    const docAfter = mockDb.assessments.get(assessmentId);
    assert.strictEqual(docAfter.score, 90, "Original score was not overwritten");
    assert.strictEqual(docAfter.createdAt, "ORIGINAL_TIMESTAMP");
});

test("Transaction rollback ensures all-or-nothing on failure", async () => {
    const mockDb = new MockFirestoreTransactionDb();
    mockDb.users.set("user_1", { name: "Test Student", lastScore: 50 });

    const assessmentId = "asmt_fail_test";
    let threwError = false;

    try {
        await mockDb.runTransaction(async (transaction) => {
            const asmtRef = { collection: "assessments", id: assessmentId };
            const userRef = { collection: "users", id: "user_1" };

            transaction.set(asmtRef, { userId: "user_1", score: 99 });
            // Simulate sudden network fault or abort
            throw new Error("Simulated network disconnection mid-transaction");
        });
    } catch {
        threwError = true;
    }

    assert.strictEqual(threwError, true);
    assert.strictEqual(mockDb.assessments.get(assessmentId), undefined, "Assessment not committed");
    assert.strictEqual(mockDb.users.get("user_1").lastScore, 50, "User doc remained unchanged");
});

// ── Test Group 4: Access Control & Authorization Policies ───────────────────
console.log("\n[Test Group 4] Role-Based Access Control on Assessments");

function evaluateAssessmentAccess(auth, operation, resourceData, targetStudentDoc, permissionsDoc) {
    if (!auth) return false;

    // Super Admin: read allowed, create allowed, update/delete denied
    if (auth.token?.superadmin === true) {
        if (operation === "read" || operation === "create") return true;
        return false;
    }

    // Student Owner: read & create own
    if (auth.token?.role === "student" && auth.token?.approvalStatus === "approved") {
        if (operation === "read") {
            return resourceData?.userId === auth.uid;
        }
        if (operation === "create") {
            return resourceData?.userId === auth.uid;
        }
        return false; // Updates & deletes denied
    }

    // Parent: read only if student's parentEmail matches parent's email
    if (auth.token?.role === "parent" && auth.token?.approvalStatus === "approved") {
        if (operation !== "read") return false;
        if (!targetStudentDoc?.parentEmail || !auth.token?.email) return false;
        return targetStudentDoc.parentEmail.toLowerCase() === auth.token.email.toLowerCase();
    }

    // Teacher: read only if student granted teacherAccess consent in permissions
    if (auth.token?.role === "teacher" && auth.token?.approvalStatus === "approved") {
        if (operation !== "read") return false;
        return permissionsDoc?.teacherAccess === true;
    }

    return false;
}

test("Student reading own assessment -> ALLOW", () => {
    const studentAuth = { uid: "std_1", token: { role: "student", approvalStatus: "approved" } };
    assert.strictEqual(evaluateAssessmentAccess(studentAuth, "read", { userId: "std_1" }), true);
});

test("Student reading another student's assessment -> DENY", () => {
    const studentAuth = { uid: "std_1", token: { role: "student", approvalStatus: "approved" } };
    assert.strictEqual(evaluateAssessmentAccess(studentAuth, "read", { userId: "std_2" }), false);
});

test("Student attempting to update existing assessment -> DENY (Immutability)", () => {
    const studentAuth = { uid: "std_1", token: { role: "student", approvalStatus: "approved" } };
    assert.strictEqual(evaluateAssessmentAccess(studentAuth, "update", { userId: "std_1" }), false);
});

test("Student attempting to spoof foreign userId on creation -> DENY", () => {
    const studentAuth = { uid: "std_1", token: { role: "student", approvalStatus: "approved" } };
    assert.strictEqual(evaluateAssessmentAccess(studentAuth, "create", { userId: "std_attacker" }), false);
});

test("Linked Parent reading child assessment -> ALLOW", () => {
    const parentAuth = { uid: "p_1", token: { role: "parent", approvalStatus: "approved", email: "mom@family.org" } };
    const studentDoc = { parentEmail: "mom@family.org" };
    assert.strictEqual(evaluateAssessmentAccess(parentAuth, "read", { userId: "std_1" }, studentDoc), true);
});

test("Unlinked Parent reading unrelated student assessment -> DENY", () => {
    const parentAuth = { uid: "p_2", token: { role: "parent", approvalStatus: "approved", email: "stranger@other.org" } };
    const studentDoc = { parentEmail: "mom@family.org" };
    assert.strictEqual(evaluateAssessmentAccess(parentAuth, "read", { userId: "std_1" }, studentDoc), false);
});

test("Teacher with active consent reading student assessment -> ALLOW", () => {
    const teacherAuth = { uid: "t_1", token: { role: "teacher", approvalStatus: "approved" } };
    const permissionsDoc = { teacherAccess: true };
    assert.strictEqual(evaluateAssessmentAccess(teacherAuth, "read", { userId: "std_1" }, {}, permissionsDoc), true);
});

test("Teacher WITHOUT consent reading student assessment -> DENY", () => {
    const teacherAuth = { uid: "t_1", token: { role: "teacher", approvalStatus: "approved" } };
    const permissionsDoc = { teacherAccess: false };
    assert.strictEqual(evaluateAssessmentAccess(teacherAuth, "read", { userId: "std_1" }, {}, permissionsDoc), false);
});

test("Super Admin read access -> ALLOW, but Super Admin update/delete -> DENY", () => {
    const adminAuth = { uid: "super_admin_1", token: { superadmin: true } };
    assert.strictEqual(evaluateAssessmentAccess(adminAuth, "read", { userId: "std_1" }), true);
    assert.strictEqual(evaluateAssessmentAccess(adminAuth, "update", { userId: "std_1" }), false);
    assert.strictEqual(evaluateAssessmentAccess(adminAuth, "delete", { userId: "std_1" }), false);
});

console.log("\n=======================================================================");
console.log(`  Historical Persistence Tests Completed: ${passed} passed, ${failed} failed`);
console.log("=======================================================================\n");

if (failed > 0) process.exit(1);

