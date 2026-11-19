"use strict";
/**
 * DyslexAid Admin Server
 * ─────────────────────
 * Trusted Node.js/Express server that performs privileged Firestore operations
 * through the Firebase Admin SDK. The React frontend NEVER performs privileged
 * writes directly — it sends the Firebase ID token here, and this server
 * verifies the token + superadmin custom claim before acting.
 *
 * Run:
 *   cd server
 *   cp .env.example .env     ← fill in GOOGLE_APPLICATION_CREDENTIALS, etc.
 *   npm install
 *   npm start                ← listens on PORT (default 3001)
 *
 * Set VITE_ADMIN_API_URL=http://localhost:3001 in the React .env.local
 * so the admin dashboard can reach this server during development.
 */
require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const admin   = require("firebase-admin");

// ── Validation ───────────────────────────────────────────────────────────────
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("[Server] FATAL: GOOGLE_APPLICATION_CREDENTIALS is not set.");
    console.error("[Server] Copy server/.env.example to server/.env and fill in values.");
    process.exit(1);
}

// ── Firebase Admin Init ──────────────────────────────────────────────────────
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId:  process.env.FIREBASE_PROJECT_ID,
});

// ── Express Setup ────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (curl, Postman) only in non-production
        if (!origin) return cb(null, process.env.NODE_ENV !== "production");
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not allowed.`));
    },
    credentials: true,
}));

app.use(express.json());

// ── Performance & Health Tracking Middleware ─────────────────────────────────
const systemMonitor = require("./services/systemMonitor");
app.use(systemMonitor.trackRequest());

// ── Routes ───────────────────────────────────────────────────────────────────
app.get("/", (_req, res) =>
    res.json({ message: "DyslexAid Admin Server is running 🛡️", status: "ok" })
);

app.get("/health", (_req, res) =>
    res.json({ status: "ok", timestamp: new Date().toISOString() })
);

app.use("/api/admin", require("./routes/admin"));
app.use("/api/registration", require("./routes/registration"));

// ── 404 / Error handlers ─────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found." }));

app.use((err, _req, res, _next) => {
    console.error("[Server] Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error." });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Server] DyslexAid Admin Server listening on http://localhost:${PORT}`);
    console.log(`[Server] Allowed origins: ${allowedOrigins.join(", ")}`);
});

