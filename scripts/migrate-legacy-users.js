#!/usr/bin/env node
/**
 * DyslexAid – Legacy Users Migration Script
 * =========================================
 * Migrates existing pre-approval accounts by safely setting:
 *   - approvalStatus: "approved"
 *   - accountStatus: "active"
 *   - migratedAt: serverTimestamp()
 *   - legacyUser: true
 *
 * STRICT SAFETY RULES:
 *   - All existing fields (xp, streak, badges, guardianPin, trustedDevices,
 *     parentEmail, lastRisk, lastAccuracy, practiceCompleted flags) are preserved.
 *   - Defaults to DRY-RUN mode. To apply changes, pass: --execute
 *   - Requires GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage:
 *   # Dry Run (safe inspection):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrate-legacy-users.js
 *
 *   # Execute (apply changes):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrate-legacy-users.js --execute
 */

"use strict";

import admin from "firebase-admin";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable must be set.");
    process.exit(1);
}

const isExecute = process.argv.includes("--execute");

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function runMigration() {
    console.log("=== DyslexAid Legacy User Migration ===");
    console.log(`Mode: ${isExecute ? "🚨 EXECUTE (LIVE WRITES)" : "🔍 DRY RUN (READ ONLY)"}`);
    console.log("");

    const usersSnap = await db.collection("users").get();
    console.log(`Total users in database: ${usersSnap.size}`);

    let legacyCount = 0;
    let alreadyApprovedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let superadminCount = 0;

    const legacyUsers = [];

    usersSnap.forEach((doc) => {
        const data = doc.data();
        if (data.role === "superadmin") {
            superadminCount++;
            return;
        }

        if (!data.approvalStatus) {
            legacyCount++;
            legacyUsers.push({ id: doc.id, ...data });
        } else if (data.approvalStatus === "approved") {
            alreadyApprovedCount++;
        } else if (data.approvalStatus === "pending") {
            pendingCount++;
        } else if (data.approvalStatus === "rejected") {
            rejectedCount++;
        }
    });

    console.log("Account Status Breakdown:");
    console.log(`  - Legacy Users (no approvalStatus) : ${legacyCount}`);
    console.log(`  - Approved Users                   : ${alreadyApprovedCount}`);
    console.log(`  - Pending Users                    : ${pendingCount}`);
    console.log(`  - Rejected Users                   : ${rejectedCount}`);
    console.log(`  - Super Admin                      : ${superadminCount}`);
    console.log("");

    if (legacyCount === 0) {
        console.log("✅ No legacy accounts found requiring migration. Database is fully up to date.");
        process.exit(0);
    }

    if (!isExecute) {
        console.log(`[DRY RUN] ${legacyCount} legacy users would be updated to:`);
        console.log(`          approvalStatus: "approved", accountStatus: "active"`);
        console.log("Sample legacy record to be migrated (preserving all fields):");
        const sample = legacyUsers[0];
        console.log(JSON.stringify({
            id: sample.id,
            email: sample.email,
            role: sample.role,
            xp: sample.xp,
            streak: sample.streak,
            badges: sample.badges,
            guardianPin: sample.guardianPin ? "****" : "none",
            targetApprovalStatus: "approved",
            targetAccountStatus: "active",
        }, null, 2));
        console.log("");
        console.log("To apply this migration to live Firestore, run with --execute:");
        console.log("GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrate-legacy-users.js --execute");
        process.exit(0);
    }

    console.log(`Migrating ${legacyCount} legacy accounts in batches...`);
    const batch = db.batch();

    legacyUsers.forEach((u) => {
        const userRef = db.collection("users").doc(u.id);
        batch.update(userRef, {
            approvalStatus: "approved",
            accountStatus: u.accountStatus || "active",
            legacyUser: true,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

    await batch.commit();
    console.log(`✅ Successfully migrated ${legacyCount} legacy users to approvalStatus: "approved"!`);
    console.log("All XP, streaks, badges, guardian PINs, and assessment scores were preserved.");
    process.exit(0);
}

runMigration().catch((err) => {
    console.error("[Migration] Fatal error:", err);
    process.exit(1);
});

