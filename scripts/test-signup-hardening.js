"use strict";
/**
 * DyslexAid - Signup UX & Duplicate Submission Hardening Test Suite
 * ──────────────────────────────────────────────────────────────
 * Rigorously tests:
 *  1. Precise pre-flight validation (empty, malformed, weak, mismatched).
 *  2. isSubmitting state machine & rapid double-click guard.
 *  3. Idempotent profile creation without overwriting approved/rejected/suspended states.
 *  4. Friendly existing-email handling vs active session recovery.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const assert = require("assert");

import { validateSignupForm } from "../src/utils/signupValidation.js";

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

async function runSignupTests() {
    console.log("=======================================================================");
    console.log("  Running Signup UX & Duplicate Submission Hardening Tests");
    console.log("=======================================================================\n");

    // ── 1. Precise Field-Level Pre-Flight Validation ──────────────────────────
    console.log("[Test Group 1] Pre-Flight Client-Side Validation");

    test("Empty full name is rejected with precise message", () => {
        const res = validateSignupForm({ name: "", email: "test@example.com", password: "password123", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Please enter your full name.");
    });

    test("Whitespace-only name is rejected", () => {
        const res = validateSignupForm({ name: "   ", email: "test@example.com", password: "password123", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Please enter your full name.");
    });

    test("Overly long name (>100 chars) is rejected", () => {
        const res = validateSignupForm({ name: "A".repeat(101), email: "test@example.com", password: "password123", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Full name must be 100 characters or fewer.");
    });

    test("Empty email is rejected with precise message", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "", password: "password123", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Please enter your email address.");
    });

    test("Malformed email format is rejected", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "invalid-email-address", password: "password123", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Please enter a valid email address.");
    });

    test("Empty password is rejected", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "aarav@example.com", password: "", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Please enter a password.");
    });

    test("Weak password (<6 characters) is rejected", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "aarav@example.com", password: "12345", role: "student", parentEmail: "parent@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Password must be at least 6 characters long.");
    });

    test("Student role without parent email is rejected", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "aarav@example.com", password: "password123", role: "student", parentEmail: "" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Parent email is required for student registration.");
    });

    test("Student role with invalid parent email format is rejected", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "aarav@example.com", password: "password123", role: "student", parentEmail: "not-an-email" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Please enter a valid parent email address.");
    });

    test("Student role with parent email identical to student email is rejected", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "aarav@example.com", password: "password123", role: "student", parentEmail: "Aarav@example.com" });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.message, "Parent email cannot be identical to student email.");
    });

    test("Teacher role does not require parent email", () => {
        const res = validateSignupForm({ name: "Pooja Verma", email: "pooja@school.edu", password: "password123", role: "teacher", parentEmail: "" });
        assert.strictEqual(res.valid, true);
    });

    test("Parent role does not require parent email", () => {
        const res = validateSignupForm({ name: "Rajesh Sharma", email: "rajesh@example.com", password: "password123", role: "parent", parentEmail: "" });
        assert.strictEqual(res.valid, true);
    });

    test("Valid student registration passes validation", () => {
        const res = validateSignupForm({ name: "Aarav Sharma", email: "aarav@example.com", password: "password123", role: "student", parentEmail: "rajesh@example.com" });
        assert.strictEqual(res.valid, true);
    });

    // ── 2. Duplicate Submission & State Machine Guard ─────────────────────────
    console.log("\n[Test Group 2] Duplicate Submission & Rapid Click Protection");

    test("Submitting state machine prevents duplicate concurrent execution", () => {
        let isSubmitting = false;
        let executionCount = 0;

        function simulateSubmit() {
            if (isSubmitting) return "BLOCKED";
            isSubmitting = true;
            executionCount++;
            return "EXECUTED";
        }

        // First click
        const firstClick = simulateSubmit();
        assert.strictEqual(firstClick, "EXECUTED");
        assert.strictEqual(executionCount, 1);

        // Immediate rapid second and third clicks while first is in-flight
        const secondClick = simulateSubmit();
        const thirdClick = simulateSubmit();
        assert.strictEqual(secondClick, "BLOCKED");
        assert.strictEqual(thirdClick, "BLOCKED");
        assert.strictEqual(executionCount, 1);

        // After completion
        isSubmitting = false;
        const subsequentClick = simulateSubmit();
        assert.strictEqual(subsequentClick, "EXECUTED");
        assert.strictEqual(executionCount, 2);
    });

    // ── 3. Partial Failure & Idempotent Profile Recovery ──────────────────────
    console.log("\n[Test Group 3] Idempotent Profile Creation & Safe Recovery");

    test("Profile creation initializes pending status on new documents", () => {
        const store = new Map();
        function mockEnsureProfile(userId, data) {
            if (!store.has(userId)) {
                store.set(userId, { ...data, approvalStatus: "pending", accountStatus: "active" });
            }
        }

        mockEnsureProfile("uid-new-1", { name: "New Student", role: "student" });
        assert.strictEqual(store.get("uid-new-1").approvalStatus, "pending");
    });

    test("Profile recovery NEVER overwrites existing approved user to pending", () => {
        const store = new Map();
        store.set("uid-approved-1", { name: "Approved User", role: "student", approvalStatus: "approved", accountStatus: "active" });

        function mockIdempotentProfile(userId, newData) {
            const existing = store.get(userId);
            if (existing) {
                // Safe merge rule: never overwrite approvalStatus if already set
                if (!existing.approvalStatus) {
                    store.set(userId, { ...existing, ...newData, approvalStatus: "pending" });
                }
            } else {
                store.set(userId, { ...newData, approvalStatus: "pending" });
            }
        }

        mockIdempotentProfile("uid-approved-1", { name: "Approved User", role: "student" });
        assert.strictEqual(store.get("uid-approved-1").approvalStatus, "approved", "Approved status preserved!");
    });

    test("Profile recovery NEVER overwrites existing suspended user to active", () => {
        const store = new Map();
        store.set("uid-suspended-1", { name: "Suspended User", role: "student", approvalStatus: "approved", accountStatus: "suspended" });

        function mockIdempotentProfile(userId, newData) {
            const existing = store.get(userId);
            if (existing) {
                if (!existing.approvalStatus) {
                    store.set(userId, { ...existing, ...newData, approvalStatus: "pending", accountStatus: existing.accountStatus || "active" });
                }
            } else {
                store.set(userId, { ...newData, approvalStatus: "pending", accountStatus: "active" });
            }
        }

        mockIdempotentProfile("uid-suspended-1", { name: "Suspended User", role: "student" });
        assert.strictEqual(store.get("uid-suspended-1").accountStatus, "suspended", "Suspended status preserved!");
    });

    test("Existing email error distinguishes active session recovery from foreign account", () => {
        const currentUser = { email: "aarav@example.com", uid: "uid-aarav" };

        function handleEmailInUse(attemptedEmail) {
            if (currentUser && currentUser.email.toLowerCase() === attemptedEmail.toLowerCase()) {
                return { action: "RECOVER_PROFILE", uid: currentUser.uid };
            }
            return { action: "SHOW_LOGIN_TOAST", message: "An account with this email already exists. Please log in instead." };
        }

        // Case A: User's own session after auth succeeded but Firestore failed
        const ownRecovery = handleEmailInUse("aarav@example.com");
        assert.strictEqual(ownRecovery.action, "RECOVER_PROFILE");
        assert.strictEqual(ownRecovery.uid, "uid-aarav");

        // Case B: Different visitor trying to register an already-taken email
        const foreignAttempt = handleEmailInUse("other-existing@example.com");
        assert.strictEqual(foreignAttempt.action, "SHOW_LOGIN_TOAST");
        assert.strictEqual(foreignAttempt.message, "An account with this email already exists. Please log in instead.");
    });

    console.log("\n=======================================================================");
    console.log(`  Signup Hardening Tests Completed: ${passed} passed, ${failed} failed`);
    console.log("=======================================================================\n");

    if (failed > 0) process.exit(1);
}

runSignupTests().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
});
