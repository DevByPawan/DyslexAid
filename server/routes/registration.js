"use strict";
/**
 * Registration Approval Routes
 * ────────────────────────────
 * Trusted server-side registration approval request handler.
 * Ordinary users call this endpoint with their Firebase Auth ID token
 * to register an approval request without needing direct read/write
 * permissions to the administrative approvalRequests collection.
 *
 * POST /api/registration/request-approval
 */
const express = require("express");
const admin   = require("firebase-admin");

const router = express.Router();
const db     = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

/**
 * Middleware: Verify that the caller has a valid, non-expired Firebase Auth ID token.
 * Populates req.uid and req.email from the verified token claims.
 */
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or malformed Authorization header." });
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
        return res.status(401).json({ error: "Empty authorization token." });
    }

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.user  = decoded;
        req.uid   = decoded.uid;
        req.email = decoded.email || "";
        return next();
    } catch (err) {
        console.error("[verifyAuth] Token verification failure:", err.message);
        return res.status(401).json({ error: "Invalid, expired, or revoked authentication token." });
    }
}

/**
 * POST /api/registration/request-approval
 * ───────────────────────────────────────
 * Creates an immutable registration approval request for the authenticated user.
 *
 * Guarantees:
 *  1. Request operates strictly on the caller's verified UID (no spoofing).
 *  2. User cannot self-approve (status is hardcoded to 'pending').
 *  3. Preserves existing approved, rejected, or suspended statuses.
 *  4. Idempotent: does not overwrite an existing approval request.
 */
router.post("/request-approval", verifyAuth, async (req, res) => {
    const uid        = req.uid;
    const tokenEmail = req.email;

    try {
        const userRef = db.collection("users").doc(uid);
        const reqRef  = db.collection("approvalRequests").doc(uid);

        const [userSnap, reqSnap] = await Promise.all([userRef.get(), reqRef.get()]);

        if (!userSnap.exists) {
            return res.status(404).json({
                error: "User profile does not exist. Please complete user registration first.",
            });
        }

        const userData = userSnap.data();

        // Strict Role Validation: Only student, teacher, parent allowed (reject invalid roles with 400)
        const requestedRole = userData.role || req.body.role;
        const allowedRoles  = ["student", "teacher", "parent"];
        if (!requestedRole || !allowedRoles.includes(requestedRole)) {
            return res.status(400).json({
                error: "Invalid or missing role. Allowed roles are: student, teacher, parent.",
            });
        }
        const validRole = requestedRole;

        // Security check: Never regress or modify an already approved, rejected, or suspended user
        if (userData.approvalStatus === "approved" || userData.approvalStatus === "rejected" || userData.accountStatus === "suspended") {
            return res.json({
                success: true,
                message: `User account is already ${userData.approvalStatus || userData.accountStatus}.`,
                approvalStatus: userData.approvalStatus || "pending",
                accountStatus: userData.accountStatus || "active",
                role: userData.role || validRole,
            });
        }

        // Idempotency: If an approval request already exists, preserve it
        if (reqSnap.exists) {
            const existingReq = reqSnap.data();
            return res.json({
                success: true,
                message: "Approval request is already registered.",
                approvalStatus: userData.approvalStatus || "pending",
                accountStatus: userData.accountStatus || "active",
                role: userData.role || existingReq.requestedRole || validRole,
            });
        }

        const cleanParentEmail = validRole === "student"
            ? (userData.parentEmail || req.body.parentEmail || "").trim()
            : "";

        // Server-authoritative write: Always 'pending', never user-controllable status
        await reqRef.set({
            userId:        uid,
            name:          (userData.name || req.body.name || "").trim().slice(0, 100),
            email:         tokenEmail || userData.email || "",
            requestedRole: validRole,
            parentEmail:   cleanParentEmail.slice(0, 100),
            status:        "pending",
            requestedAt:   FieldValue.serverTimestamp(),
        });

        return res.json({
            success: true,
            message: "Approval request created successfully.",
            approvalStatus: "pending",
            accountStatus: "active",
            role: validRole,
        });
    } catch (err) {
        console.error("[registration/request-approval] Error:", err.message);
        return res.status(500).json({ error: "Failed to create approval request." });
    }
});

module.exports = router;

