#!/usr/bin/env node
/**
 * DyslexAid – Legacy User Backup Script
 * =====================================
 * Safely exports all documents from Firestore collections:
 *   - users
 *   - permissions
 *   - activityLogs
 *   - approvalRequests
 *
 * Saves a timestamped JSON file to ./backups/
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/backup-users.js
 */

"use strict";

import admin from "firebase-admin";
import fs from "fs";
import path from "path";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable must be set.");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function exportCollection(name) {
    console.log(`[Backup] Fetching collection: ${name}...`);
    const snap = await db.collection(name).get();
    const records = [];
    snap.forEach((doc) => {
        records.push({
            id: doc.id,
            ...doc.data(),
        });
    });
    console.log(`[Backup] Collected ${records.length} records from ${name}.`);
    return records;
}

async function runBackup() {
    console.log("=== DyslexAid Database Backup Starting ===");

    const backupDir = path.resolve(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupData = {
        exportedAt: new Date().toISOString(),
        collections: {
            users: await exportCollection("users"),
            permissions: await exportCollection("permissions"),
            activityLogs: await exportCollection("activityLogs"),
            approvalRequests: await exportCollection("approvalRequests"),
        },
    };

    const filename = `dyslexaid-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const outputPath = path.join(backupDir, filename);

    fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), "utf-8");

    console.log("");
    console.log(`✅ Backup successfully saved to: ${outputPath}`);
    console.log(`Total users backed up: ${backupData.collections.users.length}`);
    console.log("=== Backup Completed ===");
    process.exit(0);
}

runBackup().catch((err) => {
    console.error("[Backup] Fatal error:", err);
    process.exit(1);
});

