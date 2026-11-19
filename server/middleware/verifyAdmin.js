"use strict";
/**
 * verifyAdmin middleware
 * ─────────────────────
 * Rigorous multi-factor server-side admin authorization:
 *  1. Validates presence of Authorization: Bearer <token>
 *  2. Verifies cryptographic signature & expiration of Firebase ID token
 *  3. Verifies server-issued custom claim: decoded.superadmin === true
 *  4. Verifies Primary Super Admin singleton identity:
 *     - Matches UID against admin_config/primary sentinel or SUPERADMIN_UID env
 *  5. Rejects any forged role fields or non-primary tokens
 */
const admin = require("firebase-admin");

module.exports = async function verifyAdmin(req, res, next) {
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

        // 1. Verify custom claim (server-authoritative)
        if (decoded.superadmin !== true) {
            return res.status(403).json({
                error: "Forbidden: Account does not possess verified superadmin privileges.",
            });
        }

        // 2. Verify Primary Super Admin identity (singleton enforcement)
        const db = admin.firestore();
        const primaryDoc = await db.collection("admin_config").doc("primary").get();

        if (primaryDoc.exists) {
            const primaryUid = primaryDoc.data().uid;
            if (decoded.uid !== primaryUid) {
                return res.status(403).json({
                    error: "Forbidden: You are not the authorized primary Super Admin.",
                });
            }
        } else if (process.env.SUPERADMIN_UID) {
            if (decoded.uid !== process.env.SUPERADMIN_UID) {
                return res.status(403).json({
                    error: "Forbidden: Identity does not match designated primary Super Admin.",
                });
            }
        }

        req.adminUid = decoded.uid;
        req.adminEmail = decoded.email || "";
        return next();
    } catch (err) {
        console.error("[verifyAdmin] Token verification failure:", err.message);
        return res.status(401).json({ error: "Invalid, expired, or revoked authentication token." });
    }
};
