"use strict";
/**
 * System Monitor Service
 * ───────────────────────
 * In-memory performance tracking, bounded circular buffers for metrics/incidents,
 * and multi-subsystem connectivity health probes.
 *
 * ARCHITECTURAL CONSTRAINTS & LIMITATIONS:
 * 1. Process-Local Storage: All metrics, incident rings, and endpoint counters
 *    are held strictly in process memory. They reset to zero whenever the Node.js
 *    process restarts.
 * 2. Multi-Instance Deployments: In autoscaled, clustered, or multi-instance
 *    environments (e.g. Google Cloud Run, Kubernetes, AWS ECS), each backend
 *    process maintains its own independent in-memory state. To aggregate across
 *    replicas in production, an external metrics collector (such as Prometheus
 *    scraping /metrics, or Cloud Monitoring/Datadog) or a centralized Redis
 *    store would be required.
 * 3. Fail-Safe Execution: Telemetry failures are strictly isolated and will
 *    never crash the server or disrupt client request processing.
 * 4. Zero Secrets / Sensitive Payload Scrubbing: No request bodies, headers,
 *    cookies, tokens, guardian PINs, or speech recordings are ever retained.
 * 5. Dynamic URL Normalization: Dynamic route parameters (such as UIDs, UUIDs,
 *    or emails) are normalized to generic placeholders (:userId, :id, :email)
 *    to prevent metric cardinality explosion and eliminate sensitive data leakage.
 */

const MAX_INCIDENTS = 100;
const MAX_SLOW_REQUESTS = 50;
const MAX_ENDPOINT_BUCKETS = 50;
const SLOW_REQUEST_THRESHOLD_MS = 500;
const INCIDENT_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute deduplication cooldown
const PROBE_TIMEOUT_MS = 3000; // 3-second strict timeout for health probes

/**
 * Normalize dynamic URL segments to prevent cardinality explosion and ID leakage.
 */
function normalizeRoutePath(path) {
    if (!path || typeof path !== "string") return "/";
    let normalized = path.split("?")[0]; // Strip query parameters

    // 1. Normalize email addresses in path
    normalized = normalized.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, ":email");

    // 2. Normalize standard UUIDs
    normalized = normalized.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":id");

    // 3. Normalize Firebase Auth UIDs (alphanumeric, length >= 16)
    normalized = normalized.replace(/\/users\/[a-zA-Z0-9_-]{16,}/g, "/users/:userId");

    // 4. Normalize generic resource ID paths
    normalized = normalized.replace(/\/(users|permissions|approvalRequests|audit-logs)\/[a-zA-Z0-9_-]+/g, "/$1/:id");

    return normalized;
}

/**
 * Sanitize diagnostic messages to strip stack traces, filesystem paths, and secrets.
 */
function sanitizeDiagnosticMessage(message) {
    if (typeof message !== "string") return "An unexpected system event occurred.";

    return message
        // Strip HTML tags
        .replace(/<[^>]*>?/gm, "")
        // Strip absolute filesystem paths
        .replace(/(\/[a-zA-Z0-9_\-.]+)+/g, "[path]")
        // Strip Windows-style filesystem paths
        .replace(/[a-zA-Z]:\\[a-zA-Z0-9_.\-\\]+/g, "[path]")
        // Strip common token patterns
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [redacted]")
        // Limit length
        .slice(0, 300);
}

class SystemMonitor {
    constructor() {
        this.startTime = Date.now();
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.clientErrors = 0;
        this.serverErrors = 0;
        this.totalLatencyMs = 0;

        // Bounded ring buffer for recent platform incidents
        this.incidents = [];

        // Incident deduplication cooldown map (key: `${service}:${eventType}` -> lastLoggedEpoch)
        this.incidentCooldowns = new Map();

        // Bounded ring buffer for slow requests (>500ms)
        this.slowRequests = [];

        // Map of endpoint -> { count, totalLatencyMs, errors4xx, errors5xx, lastAccessed }
        this.endpointMetrics = new Map();

        // Hourly request distribution (24 rolling 1-hour slots)
        this.hourlySlots = new Map();

        // Track last known service states for incident generation on transition
        this.serviceStates = {
            backend: "operational",
            firestore: "unknown",
            firebaseAuth: "unknown",
            flaskMl: "unknown",
        };
        // In-flight probe guards to prevent probe accumulation on hanging dependencies
        this.pendingProbes = {
            firestore: false,
            auth: false,
        };
        this.lastHealthCheck = null;
    }

    /**
     * Record a platform incident safely into the bounded circular buffer.
     * Includes automatic deduplication and cooldown to prevent alert flooding.
     */
    recordIncident({ eventType, service, severity = "info", message, details = {} }) {
        try {
            const safeMessage = sanitizeDiagnosticMessage(message);
            const normalizedService = service || "unknown";
            const normalizedType = eventType || "SYSTEM_EVENT";
            const cooldownKey = `${normalizedService}:${normalizedType}`;
            const now = Date.now();

            // Check if this incident type for this service occurred recently within cooldown
            if (this.incidentCooldowns.has(cooldownKey)) {
                const lastTime = this.incidentCooldowns.get(cooldownKey);
                if (now - lastTime < INCIDENT_COOLDOWN_MS) {
                    // Find the existing incident and increment repeat count rather than appending duplicates
                    const existing = this.incidents.find(
                        (i) => i.service === normalizedService && i.eventType === normalizedType
                    );
                    if (existing) {
                        existing.repeatCount = (existing.repeatCount || 1) + 1;
                        existing.lastSeen = now;
                        return existing;
                    }
                }
            }

            // Update cooldown timestamp
            this.incidentCooldowns.set(cooldownKey, now);

            // Clean expired cooldowns past 1 hour
            if (this.incidentCooldowns.size > 50) {
                for (const [k, time] of this.incidentCooldowns.entries()) {
                    if (now - time > INCIDENT_COOLDOWN_MS) this.incidentCooldowns.delete(k);
                }
            }

            const incident = {
                id: `inc_${now}_${Math.random().toString(36).substring(2, 7)}`,
                eventType: normalizedType,
                service: normalizedService,
                severity, // 'critical' | 'error' | 'warning' | 'info'
                message: safeMessage,
                timestamp: now,
                repeatCount: 1,
                details: typeof details === "object" && details !== null ? { ...details } : {},
            };

            this.incidents.unshift(incident);
            if (this.incidents.length > MAX_INCIDENTS) {
                this.incidents.pop();
            }

            return incident;
        } catch (err) {
            console.error("[SystemMonitor/recordIncident] Safe fallback error:", err.message);
            return null;
        }
    }

    /**
     * Clear incident cooldown for a service when a recovery event is logged.
     */
    clearIncidentCooldown(service) {
        for (const key of this.incidentCooldowns.keys()) {
            if (key.startsWith(`${service}:`)) {
                this.incidentCooldowns.delete(key);
            }
        }
    }

    /**
     * Express middleware to track request performance, response codes, and slow queries.
     * Guaranteed never to throw, block, or interfere with request handling.
     */
    trackRequest() {
        return (req, res, next) => {
            const startHrTime = process.hrtime();
            const startEpoch = Date.now();

            res.on("finish", () => {
                try {
                    const diff = process.hrtime(startHrTime);
                    const latencyMs = Math.round(diff[0] * 1000 + diff[1] / 1e6);

                    this.totalRequests++;
                    this.totalLatencyMs += latencyMs;

                    const statusCode = res.statusCode;
                    if (statusCode >= 200 && statusCode < 400) {
                        this.successfulRequests++;
                    } else if (statusCode >= 400 && statusCode < 500) {
                        this.clientErrors++;
                    } else if (statusCode >= 500) {
                        this.serverErrors++;
                        this.recordIncident({
                            eventType: "BACKEND_ERROR",
                            service: "admin-backend",
                            severity: "error",
                            message: `HTTP ${statusCode} returned on ${req.method} ${normalizeRoutePath(req.baseUrl || "")}${normalizeRoutePath(req.path || "")}`,
                        });
                    }

                    // Track slow requests with normalized path
                    const rawRoute = (req.baseUrl || "") + (req.path || "");
                    const normalizedRoute = normalizeRoutePath(rawRoute);

                    if (latencyMs >= SLOW_REQUEST_THRESHOLD_MS) {
                        const slowRecord = {
                            method: req.method,
                            path: normalizedRoute,
                            latencyMs,
                            statusCode,
                            timestamp: startEpoch,
                        };
                        this.slowRequests.unshift(slowRecord);
                        if (this.slowRequests.length > MAX_SLOW_REQUESTS) {
                            this.slowRequests.pop();
                        }
                    }

                    // Track per-endpoint metrics with normalized route
                    const endpointKey = `${req.method} ${normalizedRoute}`;

                    if (this.endpointMetrics.size < MAX_ENDPOINT_BUCKETS || this.endpointMetrics.has(endpointKey)) {
                        const existing = this.endpointMetrics.get(endpointKey) || {
                            endpoint: endpointKey,
                            method: req.method,
                            path: normalizedRoute,
                            count: 0,
                            totalLatencyMs: 0,
                            errors4xx: 0,
                            errors5xx: 0,
                            lastAccessed: startEpoch,
                        };
                        existing.count++;
                        existing.totalLatencyMs += latencyMs;
                        if (statusCode >= 400 && statusCode < 500) existing.errors4xx++;
                        if (statusCode >= 500) existing.errors5xx++;
                        existing.lastAccessed = startEpoch;
                        this.endpointMetrics.set(endpointKey, existing);
                    }

                    // Update hourly aggregation slot
                    const hourSlotKey = new Date(startEpoch).toISOString().slice(0, 13) + ":00:00Z";
                    const slot = this.hourlySlots.get(hourSlotKey) || {
                        hour: hourSlotKey,
                        requests: 0,
                        errors: 0,
                        latencySum: 0,
                    };
                    slot.requests++;
                    if (statusCode >= 400) slot.errors++;
                    slot.latencySum += latencyMs;
                    this.hourlySlots.set(hourSlotKey, slot);

                    // Evict older slots beyond 24 hours
                    if (this.hourlySlots.size > 24) {
                        const oldestKey = this.hourlySlots.keys().next().value;
                        this.hourlySlots.delete(oldestKey);
                    }
                } catch (metricErr) {
                    console.error("[SystemMonitor/trackRequest] Metric recording error:", metricErr.message);
                }
            });

            next();
        };
    }

    /**
     * Probes all platform subsystems and measures latency without leaking secrets.
     * Enforces strict timeouts on all external network and database calls.
     */
    async checkHealth({ db, admin, flaskUrl = "https://dyslexaid-backend.onrender.com" }) {
        const now = Date.now();
        const uptimeSeconds = Math.floor((now - this.startTime) / 1000);
        const mem = process.memoryUsage();

        const subsystems = {
            frontend: {
                name: "Frontend Application",
                category: "client",
                status: "client_reported",
                latencyMs: 0,
                message: "Active authenticated Super Admin client session connected; synthetic headless browser ping not configured.",
                lastChecked: now,
            },
            backend: {
                name: "Admin Backend Server",
                category: "api",
                status: "operational",
                latencyMs: 0,
                uptimeSeconds,
                memory: {
                    rssMb: Math.round(mem.rss / 1024 / 1024),
                    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
                },
                message: "Express server running and processing requests.",
                lastChecked: now,
            },
            firestore: {
                name: "Cloud Firestore Database",
                category: "database",
                status: "unknown",
                latencyMs: null,
                message: "Testing connectivity...",
                lastChecked: now,
            },
            firebaseAuth: {
                name: "Firebase Authentication",
                category: "auth",
                status: "unknown",
                latencyMs: null,
                message: "Testing identity provider connectivity...",
                lastChecked: now,
            },
            flaskMl: {
                name: "Flask ML Screening Engine",
                category: "ai",
                status: "unknown",
                latencyMs: null,
                endpoint: flaskUrl,
                message: "Testing ML server HTTP reachability...",
                lastChecked: now,
            },
        };

        // 1. Cloud Firestore Probe with Strict 3-Second Timeout & In-Flight Protection
        if (db) {
            if (this.pendingProbes.firestore) {
                // If a prior query is still hanging, do not pile up concurrent queries on connection pool
                subsystems.firestore = {
                    name: "Cloud Firestore Database",
                    category: "database",
                    status: "unavailable",
                    latencyMs: PROBE_TIMEOUT_MS,
                    message: "Previous Firestore database probe is still pending; awaiting gRPC resolution without stacking connections.",
                    lastChecked: now,
                };
            } else {
                this.pendingProbes.firestore = true;
                const fsStart = Date.now();
                let fsTimeoutId;

                const fsPromise = db.collection("admin_config").doc("primary").get();
                // Attach safe catch handler to absorb late background rejections and prevent unhandled promise rejections
                fsPromise
                    .catch(() => {})
                    .finally(() => {
                        this.pendingProbes.firestore = false;
                    });

                const timeoutPromise = new Promise((_, reject) => {
                    fsTimeoutId = setTimeout(() => reject(new Error("Firestore probe timed out after 3000ms")), PROBE_TIMEOUT_MS);
                });

                try {
                    const probeDoc = await Promise.race([fsPromise, timeoutPromise]);
                    const fsLatency = Date.now() - fsStart;
                    subsystems.firestore = {
                        name: "Cloud Firestore Database",
                        category: "database",
                        status: fsLatency > 2500 ? "degraded" : "operational",
                        latencyMs: fsLatency,
                        message: probeDoc.exists
                            ? "Active connection verified; primary admin configuration accessible."
                            : "Active connection verified; database operational.",
                        lastChecked: now,
                    };
                } catch {
                    const fsLatency = Date.now() - fsStart;
                    subsystems.firestore = {
                        name: "Cloud Firestore Database",
                        category: "database",
                        status: "unavailable",
                        latencyMs: fsLatency,
                        message: "Database query timed out or connection failed (Node.js Firestore Admin SDK operates over gRPC without DOM AbortSignal; background resolution safely captured).",
                        lastChecked: now,
                    };
                    this.recordIncident({
                        eventType: "FIREBASE_FAILURE",
                        service: "firestore",
                        severity: "critical",
                        message: "Cloud Firestore connection check failed or timed out.",
                    });
                } finally {
                    clearTimeout(fsTimeoutId);
                }
            }
        }

        // 2. Firebase Auth Probe with Strict 3-Second Timeout & In-Flight Protection
        if (admin && admin.auth) {
            if (this.pendingProbes.auth) {
                subsystems.firebaseAuth = {
                    name: "Firebase Authentication",
                    category: "auth",
                    status: "degraded",
                    latencyMs: PROBE_TIMEOUT_MS,
                    message: "Previous Auth API call is still pending; awaiting response from identity provider.",
                    lastChecked: now,
                };
            } else {
                this.pendingProbes.auth = true;
                const authStart = Date.now();
                let authTimeoutId;

                const authPromise = admin.auth().listUsers(1);
                authPromise
                    .catch(() => {})
                    .finally(() => {
                        this.pendingProbes.auth = false;
                    });

                const timeoutPromise = new Promise((_, reject) => {
                    authTimeoutId = setTimeout(() => reject(new Error("Auth probe timed out after 3000ms")), PROBE_TIMEOUT_MS);
                });

                try {
                    await Promise.race([authPromise, timeoutPromise]);
                    const authLatency = Date.now() - authStart;
                    subsystems.firebaseAuth = {
                        name: "Firebase Authentication",
                        category: "auth",
                        status: authLatency > 2500 ? "degraded" : "operational",
                        latencyMs: authLatency,
                        message: "Admin SDK connectivity to Auth service verified (validates service account credentials & read API reachability; does not evaluate end-user password or federated sign-in flows).",
                        lastChecked: now,
                    };
                } catch {
                    const authLatency = Date.now() - authStart;
                    subsystems.firebaseAuth = {
                        name: "Firebase Authentication",
                        category: "auth",
                        status: "degraded",
                        latencyMs: authLatency,
                        message: "Auth service probe timed out or encountered an error.",
                        lastChecked: now,
                    };
                } finally {
                    clearTimeout(authTimeoutId);
                }
            }
        }

        // 3. Flask ML Backend Probe with Strict 3-Second Timeout & AbortSignal Cancellation
        const mlStart = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

        try {
            // Probe root URL with GET without triggering /predict or transmitting student data
            const mlRes = await fetch(flaskUrl, {
                method: "GET",
                signal: controller.signal,
            }).catch(() => null);

            const mlLatency = Date.now() - mlStart;

            // In Flask, root GET responding with 200, 404, or 405 confirms the server process is listening
            if (mlRes && (mlRes.ok || mlRes.status === 405 || mlRes.status === 404)) {
                subsystems.flaskMl = {
                    name: "Flask ML Screening Engine",
                    category: "ai",
                    status: mlLatency > 2000 ? "degraded" : "operational",
                    latencyMs: mlLatency,
                    endpoint: flaskUrl,
                    liveness: "operational",
                    modelReadiness: "inferred_liveness_only",
                    message: mlLatency > 2000
                        ? `ML server process is responding slowly (${mlLatency}ms). Model readiness not independently verified (GET / ping only; dedicated /health endpoint not present).`
                        : "Flask HTTP server process is listening (liveness verified). Model readiness is inferred from server boot; dedicated /health endpoint not present.",
                    lastChecked: now,
                };

                // If transitioning from unavailable to operational, log a single recovery event
                if (this.serviceStates.flaskMl === "unavailable") {
                    this.clearIncidentCooldown("flask-ml");
                    this.recordIncident({
                        eventType: "SERVICE_RECOVERY",
                        service: "flask-ml",
                        severity: "info",
                        message: "Flask ML screening engine HTTP server recovered and is now operational.",
                    });
                }
            } else {
                subsystems.flaskMl = {
                    name: "Flask ML Screening Engine",
                    category: "ai",
                    status: "unavailable",
                    latencyMs: mlLatency,
                    endpoint: flaskUrl,
                    liveness: "unavailable",
                    modelReadiness: "unverified",
                    message: "ML server unreachable or cold-start delay on serverless host (socket cancelled upon timeout).",
                    lastChecked: now,
                };
                if (this.serviceStates.flaskMl !== "unavailable") {
                    this.recordIncident({
                        eventType: "ML_BACKEND_FAILURE",
                        service: "flask-ml",
                        severity: "warning",
                        message: "Flask ML screening service is currently unavailable.",
                    });
                }
            }
        } catch {
            const mlLatency = Date.now() - mlStart;
            subsystems.flaskMl = {
                name: "Flask ML Screening Engine",
                category: "ai",
                status: "unavailable",
                latencyMs: mlLatency,
                endpoint: flaskUrl,
                liveness: "unavailable",
                modelReadiness: "unverified",
                message: "ML server probe timed out after 3000ms (fetch aborted via AbortSignal).",
                lastChecked: now,
            };
        } finally {
            clearTimeout(timeoutId);
        }

        // Update last state records
        this.serviceStates = {
            backend: subsystems.backend.status,
            firestore: subsystems.firestore.status,
            firebaseAuth: subsystems.firebaseAuth.status,
            flaskMl: subsystems.flaskMl.status,
        };

        // Determine overall health status
        let overallStatus = "operational";
        if (subsystems.firestore.status === "unavailable") {
            overallStatus = "unavailable";
        } else if (
            subsystems.flaskMl.status === "unavailable" ||
            subsystems.firebaseAuth.status === "degraded" ||
            subsystems.firestore.status === "degraded"
        ) {
            overallStatus = "degraded";
        }

        this.lastHealthCheck = {
            overallStatus,
            timestamp: now,
            uptimeSeconds,
            subsystems,
        };

        return this.lastHealthCheck;
    }

    /**
     * Get aggregated API performance metrics.
     */
    getMetrics() {
        const avgLatency = this.totalRequests > 0
            ? Math.round(this.totalLatencyMs / this.totalRequests)
            : 0;

        const successRate = this.totalRequests > 0
            ? Math.round((this.successfulRequests / this.totalRequests) * 1000) / 10
            : 100;

        const endpoints = Array.from(this.endpointMetrics.values()).map((ep) => ({
            ...ep,
            avgLatencyMs: ep.count > 0 ? Math.round(ep.totalLatencyMs / ep.count) : 0,
        }));

        endpoints.sort((a, b) => b.count - a.count);

        const hourlyTimeline = Array.from(this.hourlySlots.values()).map((slot) => ({
            hour: slot.hour,
            label: new Date(slot.hour).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            requests: slot.requests,
            errors: slot.errors,
            avgLatencyMs: slot.requests > 0 ? Math.round(slot.latencySum / slot.requests) : 0,
        }));

        return {
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            clientErrors: this.clientErrors,
            serverErrors: this.serverErrors,
            successRate,
            avgLatencyMs: avgLatency,
            slowRequestsCount: this.slowRequests.length,
            slowRequests: this.slowRequests.slice(0, 20),
            endpoints,
            hourlyTimeline,
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
        };
    }

    /**
     * Get platform incidents with filtering.
     */
    getIncidents({ severity = "all", service = "all", limit = 50 } = {}) {
        let filtered = this.incidents;

        if (severity !== "all") {
            filtered = filtered.filter((inc) => inc.severity === severity);
        }
        if (service !== "all") {
            filtered = filtered.filter((inc) => inc.service === service);
        }

        return {
            total: filtered.length,
            incidents: filtered.slice(0, limit),
        };
    }
}

// Singleton instance with exported utilities for audit and test verification
const monitor = new SystemMonitor();
monitor.normalizeRoutePath = normalizeRoutePath;
monitor.sanitizeDiagnosticMessage = sanitizeDiagnosticMessage;

module.exports = monitor;
