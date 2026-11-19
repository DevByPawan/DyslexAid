/**
 * DyslexAid – Provisioning Recovery & Hardening Simulation Test Suite
 * ===================================================================
 * Verifies all 6 recovery, idempotency, and security scenarios for
 * scripts/provision-superadmin.js in an isolated in-memory environment.
 *
 * Scenarios Tested:
 *  1. Existing account with no Super Admin configuration (initial provisioning).
 *  2. Re-run with the same UID (idempotent, claim preserved).
 *  3. Existing primary configuration with the same UID (resumed and verified).
 *  4. Attempted provisioning with a different UID (strictly blocked, no takeover).
 *  5. Missing or inconsistent environment variables (SUPERADMIN_UID missing, email mismatch).
 *  6. Simulated partial failure recovery:
 *     - 6a: Interrupted after claims set -> re-run succeeds.
 *     - 6b: Interrupted after sentinel set -> re-run succeeds.
 */

"use strict";

import { provisionSuperAdmin } from "./provision-superadmin.js";

// ── In-Memory Mocks ─────────────────────────────────────────────────────────

function createMockFirestore() {
    const store = new Map();

    const getDocKey = (coll, id) => `${coll}/${id}`;

    return {
        _store: store,
        collection(collName) {
            return {
                doc(docId) {
                    const key = getDocKey(collName, docId);
                    return {
                        async get() {
                            const exists = store.has(key);
                            const data = store.get(key) || null;
                            return {
                                exists,
                                id: docId,
                                data: () => (data ? { ...data } : null),
                            };
                        },
                        async set(data, options = {}) {
                            const existing = store.get(key) || {};
                            if (options.merge) {
                                store.set(key, { ...existing, ...data });
                            } else {
                                store.set(key, { ...data });
                            }
                        },
                    };
                },
                where(field, op, val) {
                    return {
                        limit(_n) {
                            return {
                                async get() {
                                    const docs = [];
                                    for (const [k, v] of store.entries()) {
                                        if (k.startsWith(`${collName}/`)) {
                                            if (op === "==" && v[field] === val) {
                                                const id = k.split("/")[1];
                                                docs.push({
                                                    id,
                                                    data: () => ({ ...v }),
                                                });
                                            }
                                        }
                                    }
                                    return {
                                        empty: docs.length === 0,
                                        docs,
                                        size: docs.length,
                                    };
                                },
                            };
                        },
                    };
                },
            };
        },
    };
}

function createMockAuth(users = {}) {
    const userMap = new Map(Object.entries(users));

    return {
        _userMap: userMap,
        async getUser(uid) {
            if (!userMap.has(uid)) {
                const err = new Error(`No user record found for given identifier: ${uid}`);
                err.code = "auth/user-not-found";
                throw err;
            }
            return { ...userMap.get(uid) };
        },
        async setCustomUserClaims(uid, claims) {
            if (!userMap.has(uid)) throw new Error("User not found");
            const user = userMap.get(uid);
            user.customClaims = { ...claims };
            userMap.set(uid, user);
        },
    };
}

const mockFieldValue = {
    serverTimestamp: () => ({ _type: "TIMESTAMP", millis: Date.now() }),
};

const silentLogger = {
    log: () => {},
    warn: () => {},
    error: () => {},
};

// ── Test Runner ─────────────────────────────────────────────────────────────

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (!condition) {
            console.error(`  ❌ FAILED: ${message}`);
            failed++;
            throw new Error(message);
        } else {
            console.log(`  ✓ PASSED: ${message}`);
            passed++;
        }
    }

    console.log("================================================================");
    console.log("  Running Super Admin Provisioning Resilience & Hardening Tests");
    console.log("================================================================\n");

    // ── Test 1: Initial Provisioning ─────────────────────────────────────────
    console.log("[Test 1] Existing account with no Super Admin configuration");
    try {
        const mockDb = createMockFirestore();
        const mockAuth = createMockAuth({
            "uid-admin-1": {
                uid: "uid-admin-1",
                email: "admin1@dyslexaid.com",
                displayName: "Pawan Admin",
                customClaims: {},
            },
        });

        const res = await provisionSuperAdmin({
            authAdmin: mockAuth,
            db: mockDb,
            env: { SUPERADMIN_UID: "uid-admin-1", SUPERADMIN_EMAIL: "admin1@dyslexaid.com" },
            FieldValue: mockFieldValue,
            logger: silentLogger,
        });

        assert(res.success === true, "Provisioning succeeded");
        assert(res.isResumed === false, "isResumed is false on fresh provision");
        assert(mockAuth._userMap.get("uid-admin-1").customClaims.superadmin === true, "Custom claim superadmin === true was assigned");
        const sentinel = mockDb._store.get("admin_config/primary");
        assert(sentinel !== undefined && sentinel.uid === "uid-admin-1", "admin_config/primary sentinel written with correct UID");
        const userDoc = mockDb._store.get("users/uid-admin-1");
        assert(userDoc !== undefined && userDoc.role === "superadmin" && userDoc.approvalStatus === "approved", "users/ document updated to superadmin and approved");
    } catch (e) {
        console.error("Test 1 error:", e.message);
    }

    // ── Test 2: Re-run with the same UID (Idempotence) ──────────────────────
    console.log("\n[Test 2] Re-run with the SAME UID (Idempotency verification)");
    try {
        const mockDb = createMockFirestore();
        const mockAuth = createMockAuth({
            "uid-admin-1": {
                uid: "uid-admin-1",
                email: "admin1@dyslexaid.com",
                displayName: "Pawan Admin",
                customClaims: { superadmin: true },
            },
        });
        // Seed database as already provisioned
        mockDb._store.set("admin_config/primary", { uid: "uid-admin-1", email: "admin1@dyslexaid.com", superadmin: true });
        mockDb._store.set("users/uid-admin-1", { role: "superadmin", approvalStatus: "approved" });

        const res = await provisionSuperAdmin({
            authAdmin: mockAuth,
            db: mockDb,
            env: { SUPERADMIN_UID: "uid-admin-1" },
            FieldValue: mockFieldValue,
            logger: silentLogger,
        });

        assert(res.success === true, "Re-run succeeded cleanly");
        assert(res.isResumed === true, "Detected existing primary admin and marked as resumed");
        assert(res.claimAlreadyPresent === true, "Detected custom claim was already present");
    } catch (e) {
        console.error("Test 2 error:", e.message);
    }

    // ── Test 3: Existing primary configuration with same UID ─────────────────
    console.log("\n[Test 3] Existing primary configuration with the same UID");
    try {
        const mockDb = createMockFirestore();
        const mockAuth = createMockAuth({
            "uid-admin-1": {
                uid: "uid-admin-1",
                email: "admin1@dyslexaid.com",
                customClaims: {},
            },
        });
        // Primary sentinel exists with same UID, but custom claims not yet set on Auth
        mockDb._store.set("admin_config/primary", { uid: "uid-admin-1", superadmin: true });

        const res = await provisionSuperAdmin({
            authAdmin: mockAuth,
            db: mockDb,
            env: { SUPERADMIN_UID: "uid-admin-1" },
            FieldValue: mockFieldValue,
            logger: silentLogger,
        });

        assert(res.isResumed === true, "Detected existing primary config and resumed");
        assert(mockAuth._userMap.get("uid-admin-1").customClaims.superadmin === true, "Completed missing custom claim");
        assert(mockDb._store.get("users/uid-admin-1").role === "superadmin", "Completed missing users doc");
    } catch (e) {
        console.error("Test 3 error:", e.message);
    }

    // ── Test 4: Attempted provisioning with a DIFFERENT UID ─────────────────
    console.log("\n[Test 4] Attempted provisioning with a DIFFERENT UID (Takeover prevention)");
    try {
        const mockDb = createMockFirestore();
        const mockAuth = createMockAuth({
            "uid-admin-original": {
                uid: "uid-admin-original",
                email: "original@dyslexaid.com",
                customClaims: { superadmin: true },
            },
            "uid-attacker": {
                uid: "uid-attacker",
                email: "attacker@other.com",
                customClaims: {},
            },
        });
        mockDb._store.set("admin_config/primary", { uid: "uid-admin-original", superadmin: true });

        let threw = false;
        try {
            await provisionSuperAdmin({
                authAdmin: mockAuth,
                db: mockDb,
                env: { SUPERADMIN_UID: "uid-attacker" },
                FieldValue: mockFieldValue,
                logger: silentLogger,
            });
        } catch (err) {
            threw = true;
            assert(err.message.includes("ABORT: A primary Super Admin already exists with a different UID"), "Aborted with take-over rejection error");
        }
        assert(threw, "Execution threw error preventing takeover");
        assert(mockAuth._userMap.get("uid-attacker").customClaims?.superadmin !== true, "Attacker UID was NOT granted superadmin claim");
        assert(mockDb._store.get("admin_config/primary").uid === "uid-admin-original", "Original primary UID remained intact and unchanged");
    } catch (e) {
        console.error("Test 4 error:", e.message);
    }

    // ── Test 5: Missing or Inconsistent Environment Variables ────────────────
    console.log("\n[Test 5] Missing or Inconsistent Environment Variables");
    try {
        const mockDb = createMockFirestore();
        const mockAuth = createMockAuth({
            "uid-admin-1": {
                uid: "uid-admin-1",
                email: "admin1@dyslexaid.com",
                customClaims: {},
            },
        });

        // 5a. Missing SUPERADMIN_UID
        let threwMissing = false;
        try {
            await provisionSuperAdmin({
                authAdmin: mockAuth,
                db: mockDb,
                env: {},
                FieldValue: mockFieldValue,
                logger: silentLogger,
            });
        } catch (err) {
            threwMissing = true;
            assert(err.message.includes("Missing or empty SUPERADMIN_UID"), "Rejected missing SUPERADMIN_UID");
        }
        assert(threwMissing, "Threw on missing SUPERADMIN_UID");

        // 5b. Inconsistent email
        let threwEmailMismatch = false;
        try {
            await provisionSuperAdmin({
                authAdmin: mockAuth,
                db: mockDb,
                env: { SUPERADMIN_UID: "uid-admin-1", SUPERADMIN_EMAIL: "different@email.com" },
                FieldValue: mockFieldValue,
                logger: silentLogger,
            });
        } catch (err) {
            threwEmailMismatch = true;
            assert(err.message.includes("Identity mismatch: SUPERADMIN_EMAIL"), "Rejected mismatched SUPERADMIN_EMAIL");
        }
        assert(threwEmailMismatch, "Threw on email mismatch");
    } catch (e) {
        console.error("Test 5 error:", e.message);
    }

    // ── Test 6: Simulated Partial Failure Recovery ───────────────────────────
    console.log("\n[Test 6] Simulated Partial Failure Recovery");
    try {
        const mockDb = createMockFirestore();
        const mockAuth = createMockAuth({
            "uid-admin-1": {
                uid: "uid-admin-1",
                email: "admin1@dyslexaid.com",
                customClaims: {},
            },
        });

        // 6a: Partial failure at sentinel creation (claims set, but db write fails)
        // Simulate: claims already set on auth, but nothing in Firestore
        await mockAuth.setCustomUserClaims("uid-admin-1", { superadmin: true });
        assert(mockDb._store.get("admin_config/primary") === undefined, "Sentinel doc not yet created (simulated crash point)");

        // Re-run with the same UID
        const recovery1 = await provisionSuperAdmin({
            authAdmin: mockAuth,
            db: mockDb,
            env: { SUPERADMIN_UID: "uid-admin-1" },
            FieldValue: mockFieldValue,
            logger: silentLogger,
        });

        assert(recovery1.success === true, "Recovery re-run succeeded after Auth claim partial failure");
        assert(mockDb._store.get("admin_config/primary") !== undefined, "Sentinel doc was successfully recovered");
        assert(mockDb._store.get("users/uid-admin-1").role === "superadmin", "User doc was successfully created");

        // 6b: Partial failure at users doc creation (claims set and sentinel set, but users/{uid} missing)
        mockDb._store.delete("users/uid-admin-1");
        assert(mockDb._store.get("users/uid-admin-1") === undefined, "users doc deleted (simulated crash point 2)");

        const recovery2 = await provisionSuperAdmin({
            authAdmin: mockAuth,
            db: mockDb,
            env: { SUPERADMIN_UID: "uid-admin-1" },
            FieldValue: mockFieldValue,
            logger: silentLogger,
        });

        assert(recovery2.success === true, "Recovery re-run succeeded after users doc partial failure");
        assert(recovery2.isResumed === true, "Correctly recognized existing primary config and resumed");
        assert(mockDb._store.get("users/uid-admin-1").role === "superadmin", "users doc was successfully synchronized");
    } catch (e) {
        console.error("Test 6 error:", e.message);
    }

    console.log("\n================================================================");
    console.log(`  Tests Completed: ${passed} passed, ${failed} failed`);
    console.log("================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});

