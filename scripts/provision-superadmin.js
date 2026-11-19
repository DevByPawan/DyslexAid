#!/usr/bin/env node
/**
 * DyslexAid – Super Admin Provisioning Script (Hardened & Resumable)
 * =================================================================
 * Server-side bootstrap script for establishing the primary Super Admin.
 * Runs ONLY in a trusted Node.js environment (never in the client).
 *
 * Resilience & Hardening:
 *  - Safely Resumable: If a previous run failed halfway (e.g. claim set, but Firestore
 *    write interrupted), running again with the SAME UID resumes safely.
 *  - Strict Singleton: Rejects any attempt to provision a different UID if a primary
 *    Super Admin is already established in admin_config/primary.
 *  - Claims Verification: Checks userRecord.customClaims before mutating.
 *  - Identity Consistency: Validates SUPERADMIN_UID, Firebase Auth UID, and
 *    SUPERADMIN_EMAIL (if provided) are consistent.
 *  - Idempotent: Repeated runs for the same UID verify state and exit cleanly.
 *  - Non-destructive: Never deletes or overwrites an existing admin's identity.
 *
 * Required environment variables:
 *   GOOGLE_APPLICATION_CREDENTIALS   Path to service account JSON key file.
 *   SUPERADMIN_UID                   Firebase Auth UID of the account to promote.
 *   SUPERADMIN_EMAIL                 (Optional) Verified against Auth record if provided.
 */

"use strict";

import { fileURLToPath } from "url";
import process from "process";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

/**
 * Core provisioning logic – isolated and exportable for unit and simulation testing.
 *
 * @param {Object} params
 * @param {Object} params.authAdmin  Firebase Auth Admin SDK instance
 * @param {Object} params.db         Firestore Admin SDK instance
 * @param {Object} params.env        Environment variables map (e.g. process.env)
 * @param {Object} [params.FieldValue] Firestore FieldValue helper
 * @param {Object} [params.logger]   Custom logger (defaults to console)
 */
export async function provisionSuperAdmin({
    authAdmin,
    db,
    env,
    FieldValue,
    logger = console,
}) {
    const FieldValueHelper = FieldValue || { serverTimestamp: () => new Date() };
    // 1. Validate environment configuration
    const superadminUid = env.SUPERADMIN_UID?.trim();
    if (!superadminUid) {
        throw new Error("Missing or empty SUPERADMIN_UID environment variable.");
    }

    const expectedEmail = env.SUPERADMIN_EMAIL?.trim();

    logger.log("[PROVISION] Starting Super Admin provisioning...");
    logger.log(`[PROVISION] Target UID   : ${superadminUid}`);
    if (expectedEmail) {
        logger.log(`[PROVISION] Target email : ${expectedEmail}`);
    }

    // 2. Verify account exists in Firebase Auth
    let userRecord;
    try {
        userRecord = await authAdmin.getUser(superadminUid);
        logger.log(`[PROVISION] Firebase Auth user confirmed: ${userRecord.email}`);
    } catch (err) {
        throw new Error(
            `Could not find user with UID "${superadminUid}" in Firebase Auth: ${err.message}. ` +
            `Ensure the user account has already been registered in Firebase Auth before running provisioning.`,
            { cause: err }
        );
    }

    // 3. Verify identity consistency if email was explicitly provided
    if (expectedEmail && userRecord.email) {
        if (expectedEmail.toLowerCase() !== userRecord.email.toLowerCase()) {
            throw new Error(
                `Identity mismatch: SUPERADMIN_EMAIL ("${expectedEmail}") does not match ` +
                `Firebase Auth email ("${userRecord.email}") for UID "${superadminUid}". ` +
                `Provisioning halted to prevent accidental misconfiguration.`
            );
        }
    }

    // 4. Guard: Enforce singleton primary Super Admin policy
    const primaryRef = db.collection("admin_config").doc("primary");
    let isResuming = false;

    // Check primary sentinel document first
    const primarySnap = await primaryRef.get();
    if (primarySnap.exists) {
        const existingData = primarySnap.data();
        if (existingData.uid && existingData.uid !== superadminUid) {
            throw new Error(
                `ABORT: A primary Super Admin already exists with a different UID ("${existingData.uid}"). ` +
                `Only ONE primary Super Admin is permitted. Automatic takeover or overwriting of ` +
                `an existing primary administrator identity is strictly forbidden.`
            );
        }
        if (existingData.uid === superadminUid) {
            isResuming = true;
            logger.log(`[PROVISION] Existing primary configuration detected for UID: ${superadminUid}. Resuming/verifying state...`);
        }
    } else {
        // Fallback check: ensure no other sentinel doc with superadmin == true exists
        const querySnap = await db
            .collection("admin_config")
            .where("superadmin", "==", true)
            .limit(1)
            .get();

        if (!querySnap.empty) {
            const existingData = querySnap.docs[0].data();
            if (existingData.uid && existingData.uid !== superadminUid) {
                throw new Error(
                    `ABORT: A Super Admin sentinel already exists in admin_config/${querySnap.docs[0].id} ` +
                    `with a different UID ("${existingData.uid}"). Takeover is strictly forbidden.`
                );
            }
            if (existingData.uid === superadminUid) {
                isResuming = true;
                logger.log(`[PROVISION] Existing admin_config document found (${querySnap.docs[0].id}) for UID: ${superadminUid}. Resuming...`);
            }
        }
    }

    // 5. Verify & assign Custom Claims
    const currentClaims = userRecord.customClaims || {};
    const claimAlreadyPresent = currentClaims.superadmin === true;

    if (claimAlreadyPresent) {
        logger.log(`[PROVISION] Firebase Auth custom claim { superadmin: true } is already active on UID: ${superadminUid}.`);
    } else {
        try {
            await authAdmin.setCustomUserClaims(superadminUid, {
                ...currentClaims,
                superadmin: true,
            });
            logger.log(`[PROVISION] Custom claim { superadmin: true } successfully set on UID: ${superadminUid}`);
        } catch (err) {
            throw new Error(
                `Failed to assign custom claim to Auth user "${superadminUid}": ${err.message}. ` +
                `Recovery: Verify that your service account possesses the 'Firebase Authentication Admin' role and re-run.`,
                { cause: err }
            );
        }
    }

    // 6. Write or update admin_config/primary sentinel
    try {
        const sentinelData = {
            uid: superadminUid,
            email: userRecord.email,
            superadmin: true,
            updatedAt: FieldValueHelper.serverTimestamp(),
            note: "Authoritative access is enforced via Firebase Auth custom claim, not this document.",
        };
        if (!isResuming) {
            sentinelData.provisionedAt = FieldValueHelper.serverTimestamp();
        }

        await primaryRef.set(sentinelData, { merge: true });
        logger.log("[PROVISION] Firestore admin_config/primary sentinel verified and active.");
    } catch (err) {
        throw new Error(
            `Failed to write admin_config/primary sentinel: ${err.message}. ` +
            `Note: Auth custom claim has been set/verified for UID "${superadminUid}". ` +
            `Recovery: Re-run this script with the SAME UID. The script will resume safely and write the sentinel.`,
            { cause: err }
        );
    }

    // 7. Update users/{superadminUid} document with role and approved status
    try {
        await db.collection("users").doc(superadminUid).set(
            {
                role: "superadmin",
                email: userRecord.email,
                name: userRecord.displayName || "Super Admin",
                approvalStatus: "approved",
                accountStatus: "active",
                updatedAt: FieldValueHelper.serverTimestamp(),
            },
            { merge: true }
        );
        logger.log(`[PROVISION] users/${superadminUid} document updated to role: superadmin, approvalStatus: approved.`);
    } catch (err) {
        throw new Error(
            `Failed to update users/${superadminUid} document: ${err.message}. ` +
            `Note: Auth custom claim and admin_config/primary sentinel are active. ` +
            `Recovery: Re-run this script with the SAME UID to complete the user profile synchronization.`,
            { cause: err }
        );
    }

    return {
        uid: superadminUid,
        email: userRecord.email,
        isResumed: isResuming,
        claimAlreadyPresent,
        success: true,
    };
}

// ── Direct CLI Execution ──────────────────────────────────────────────────────

const isDirectExecution =
    process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
    const REQUIRED_VARS = ["GOOGLE_APPLICATION_CREDENTIALS", "SUPERADMIN_UID"];

    for (const v of REQUIRED_VARS) {
        if (!process.env[v]) {
            console.error(`[PROVISION] ERROR: Missing required environment variable: ${v}`);
            process.exit(1);
        }
    }

    initializeApp({
        credential: applicationDefault(),
    });

    const db = getFirestore();
    const authAdmin = getAuth();

    provisionSuperAdmin({
        authAdmin,
        db,
        env: process.env,
        FieldValue,
    })
        .then((result) => {
            console.log("");
            console.log("╔══════════════════════════════════════════════════════════╗");
            console.log("║        Super Admin Provisioning Completed                ║");
            console.log(`║  UID    : ${result.uid.padEnd(47)}║`);
            console.log(`║  Email  : ${result.email.padEnd(47)}║`);
            console.log(`║  Status : ${(result.isResumed ? "Resumed & Verified (Idempotent)" : "Initial Provisioning Successful").padEnd(47)}║`);
            console.log("║                                                          ║");
            console.log("║  NEXT STEPS:                                             ║");
            console.log("║  1. Sign in as Super Admin; force token refresh if       ║");
            console.log("║     already logged in (auth.currentUser.getIdToken(true))║");
            console.log("║  2. Start the admin backend server (cd server && npm start)║");
            console.log("║  3. Delete serviceAccountKey.json if stored locally.     ║");
            console.log("╚══════════════════════════════════════════════════════════╝");
            process.exit(0);
        })
        .catch((err) => {
            console.error("");
            console.error(`[PROVISION] FATAL: ${err.message}`);
            process.exit(1);
        });
}
