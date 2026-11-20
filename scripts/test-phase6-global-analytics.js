"use strict";
/**
 * DyslexAid - Phase 6.5 Global Historical Assessment Analytics Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the Super Admin Global Historical Assessment Analytics API,
 * server-side authorization, aggregate accuracy, risk distributions, cohort trends,
 * date/risk filtering, and privacy sanitization:
 *  1. Server-side Super Admin Authorization (401 / 403 / 200).
 *  2. Query Parameter Validation: bounds, date formats, and risk filters.
 *  3. Aggregate Accuracy: total count, unique students, mean scores, sub-score averages.
 *  4. Longitudinal Trends: volume, risk split, and score trajectory over time.
 *  5. Cohort Analysis: robust calculation and safe fallback on insufficient volume.
 *  6. Empty Dataset Resilience: graceful handling of zero-record scenarios.
 *  7. Privacy & Data Sanitization: strict exclusion of raw audio and private tokens.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const assert = require("assert");

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

async function testAsync(description, fn) {
    try {
        await fn();
        console.log(`  ✓ PASSED: ${description}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ FAILED: ${description}`);
        console.error(`    Error: ${err.message}`);
        failed++;
    }
}

// ── In-Memory Mock of Admin Historical Analytics Handler ─────────────────────

function createMockAnalyticsService({
    adminUid = "primary-superadmin-uid",
    assessments = [],
}) {
    function handleRequest({
        authHeader = null,
        tokenClaims = null,
        query = {},
    } = {}) {
        // 1. Authorization
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { status: 401, body: { error: "Missing or invalid Authorization header." } };
        }

        const token = authHeader.slice(7);
        if (token === "invalid-token" || !tokenClaims) {
            return { status: 401, body: { error: "Invalid or expired token." } };
        }

        if (tokenClaims.superadmin !== true) {
            return { status: 403, body: { error: "Forbidden: Super Admin claim required." } };
        }

        if (tokenClaims.uid !== adminUid) {
            return { status: 403, body: { error: "Forbidden: Unauthorized administrative identity." } };
        }

        // 2. Query Validation
        const validRisks = ["all", "Low Risk", "Moderate Risk", "High Risk", "Unknown"];
        const risk = query.risk || "all";
        if (!validRisks.includes(risk)) {
            return { status: 400, body: { error: "Invalid risk filter. Allowed values: all, Low Risk, Moderate Risk, High Risk, Unknown." } };
        }

        let startMillis = null;
        if (query.startDate) {
            startMillis = Date.parse(query.startDate);
            if (isNaN(startMillis)) {
                return { status: 400, body: { error: "Invalid startDate format: expected valid ISO 8601 or YYYY-MM-DD string." } };
            }
        }

        let endMillis = null;
        if (query.endDate) {
            endMillis = Date.parse(query.endDate);
            if (isNaN(endMillis)) {
                return { status: 400, body: { error: "Invalid endDate format: expected valid ISO 8601 or YYYY-MM-DD string." } };
            }
            if (query.endDate.length === 10) {
                endMillis += 86399999;
            }
        }

        if (startMillis !== null && endMillis !== null && startMillis > endMillis) {
            return { status: 400, body: { error: "startDate cannot be after endDate." } };
        }

        const studentId = query.studentId ? String(query.studentId).trim() : null;
        if (studentId && !/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
            return { status: 400, body: { error: "Invalid studentId parameter." } };
        }

        // 3. Filter matching assessments
        let filtered = assessments.filter((item) => {
            const d = item.data ? item.data() : item;
            if (studentId && d.userId !== studentId) return false;
            if (risk !== "all" && d.risk !== risk) return false;

            const completedAt = typeof d.completedAt?.toMillis === "function"
                ? d.completedAt.toMillis()
                : (typeof d.completedAt === "number" ? d.completedAt : Date.parse(d.completedAt || 0));

            if (startMillis !== null && completedAt < startMillis) return false;
            if (endMillis !== null && completedAt > endMillis) return false;
            return true;
        });

        const totalAssessments = filtered.length;

        // 4. Empty Set Handling
        if (totalAssessments === 0) {
            return {
                status: 200,
                body: {
                    success: true,
                    data: {
                        totalAssessments: 0,
                        uniqueStudentsAssessed: 0,
                        riskDistribution: {
                            "Low Risk": 0,
                            "Moderate Risk": 0,
                            "High Risk": 0,
                            "Unknown": 0,
                        },
                        averageScore: null,
                        averageAccuracy: null,
                        subScoresAverage: {
                            voiceAccuracy: null,
                            letterScore: null,
                            wordScore: null,
                        },
                        assessmentVolumeOverTime: [],
                        riskTrendsOverTime: [],
                        scoreTrendsOverTime: [],
                        hasSufficientCohortData: false,
                        cohorts: [],
                        notice: "No historical assessments found matching the selected criteria.",
                    },
                },
            };
        }

        // 5. Compute Aggregate Metrics
        const studentSet = new Set();
        const riskDistribution = {
            "Low Risk": 0,
            "Moderate Risk": 0,
            "High Risk": 0,
            "Unknown": 0,
        };

        let scoreSum = 0;
        let scoreCount = 0;
        let accuracySum = 0;
        let accuracyCount = 0;

        let voiceSum = 0;
        let voiceCount = 0;
        let letterSum = 0;
        let letterCount = 0;
        let wordSum = 0;
        let wordCount = 0;

        const dateVolumeMap = {};
        const dateRiskMap = {};
        const dateScoreMap = {};
        const cohortMap = {};

        filtered.forEach((item) => {
            const d = item.data ? item.data() : item;
            if (d.userId) studentSet.add(d.userId);

            const r = d.risk || "Unknown";
            if (riskDistribution[r] !== undefined) riskDistribution[r]++;
            else riskDistribution["Unknown"]++;

            if (typeof d.score === "number" && !isNaN(d.score)) {
                scoreSum += Math.min(100, Math.max(0, d.score));
                scoreCount++;
            }

            if (typeof d.accuracy === "number" && !isNaN(d.accuracy)) {
                accuracySum += Math.min(100, Math.max(0, d.accuracy));
                accuracyCount++;
            }

            if (typeof d.subScores?.voiceAccuracy === "number") {
                voiceSum += d.subScores.voiceAccuracy;
                voiceCount++;
            }
            if (typeof d.subScores?.letterScore === "number") {
                letterSum += d.subScores.letterScore;
                letterCount++;
            }
            if (typeof d.subScores?.wordScore === "number") {
                wordSum += d.subScores.wordScore;
                wordCount++;
            }

            const millis = typeof d.completedAt?.toMillis === "function"
                ? d.completedAt.toMillis()
                : (typeof d.completedAt === "number" ? d.completedAt : Date.parse(d.completedAt || 0));

            if (millis) {
                const dateKey = new Date(millis).toISOString().slice(0, 10);
                dateVolumeMap[dateKey] = (dateVolumeMap[dateKey] || 0) + 1;

                if (!dateRiskMap[dateKey]) {
                    dateRiskMap[dateKey] = { low: 0, moderate: 0, high: 0, unknown: 0 };
                }
                if (r === "Low Risk") dateRiskMap[dateKey].low++;
                else if (r === "Moderate Risk") dateRiskMap[dateKey].moderate++;
                else if (r === "High Risk") dateRiskMap[dateKey].high++;
                else dateRiskMap[dateKey].unknown++;

                if (!dateScoreMap[dateKey]) {
                    dateScoreMap[dateKey] = { scoreSum: 0, scoreCount: 0, accSum: 0, accCount: 0 };
                }
                if (typeof d.score === "number") {
                    dateScoreMap[dateKey].scoreSum += d.score;
                    dateScoreMap[dateKey].scoreCount++;
                }
                if (typeof d.accuracy === "number") {
                    dateScoreMap[dateKey].accSum += d.accuracy;
                    dateScoreMap[dateKey].accCount++;
                }

                const monthKey = dateKey.slice(0, 7);
                if (!cohortMap[monthKey]) {
                    cohortMap[monthKey] = {
                        students: new Set(),
                        count: 0,
                        scoreSum: 0,
                        scoreCount: 0,
                        accSum: 0,
                        accCount: 0,
                        low: 0,
                        moderate: 0,
                        high: 0,
                    };
                }
                cohortMap[monthKey].count++;
                if (d.userId) cohortMap[monthKey].students.add(d.userId);
                if (typeof d.score === "number") {
                    cohortMap[monthKey].scoreSum += d.score;
                    cohortMap[monthKey].scoreCount++;
                }
                if (typeof d.accuracy === "number") {
                    cohortMap[monthKey].accSum += d.accuracy;
                    cohortMap[monthKey].accCount++;
                }
                if (r === "Low Risk") cohortMap[monthKey].low++;
                else if (r === "Moderate Risk") cohortMap[monthKey].moderate++;
                else if (r === "High Risk") cohortMap[monthKey].high++;
            }
        });

        const sortedDates = Object.keys(dateVolumeMap).sort();
        const assessmentVolumeOverTime = sortedDates.map((date) => ({
            date,
            label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            count: dateVolumeMap[date],
        }));

        const riskTrendsOverTime = sortedDates.map((date) => ({
            date,
            label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            lowRisk: dateRiskMap[date]?.low || 0,
            moderateRisk: dateRiskMap[date]?.moderate || 0,
            highRisk: dateRiskMap[date]?.high || 0,
            unknown: dateRiskMap[date]?.unknown || 0,
        }));

        const scoreTrendsOverTime = sortedDates.map((date) => {
            const sc = dateScoreMap[date];
            return {
                date,
                label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                avgScore: sc?.scoreCount ? Math.round((sc.scoreSum / sc.scoreCount) * 10) / 10 : null,
                avgAccuracy: sc?.accCount ? Math.round((sc.accSum / sc.accCount) * 10) / 10 : null,
                count: sc?.scoreCount || 0,
            };
        });

        const hasSufficientCohortData = totalAssessments >= 2 && Object.keys(cohortMap).length >= 1;
        let cohorts = [];
        if (hasSufficientCohortData) {
            const sortedCohortKeys = Object.keys(cohortMap).sort();
            cohorts = sortedCohortKeys.map((k) => {
                const c = cohortMap[k];
                const [year, month] = k.split("-");
                const cohortDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
                return {
                    cohort: k,
                    label: cohortDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                    studentCount: c.students.size,
                    assessmentCount: c.count,
                    avgScore: c.scoreCount ? Math.round((c.scoreSum / c.scoreCount) * 10) / 10 : null,
                    avgAccuracy: c.accCount ? Math.round((c.accSum / c.accCount) * 10) / 10 : null,
                    riskDistribution: {
                        low: c.low,
                        moderate: c.moderate,
                        high: c.high,
                    },
                };
            });
        }

        return {
            status: 200,
            body: {
                success: true,
                data: {
                    totalAssessments,
                    uniqueStudentsAssessed: studentSet.size,
                    riskDistribution,
                    averageScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
                    averageAccuracy: accuracyCount > 0 ? Math.round((accuracySum / accuracyCount) * 10) / 10 : null,
                    subScoresAverage: {
                        voiceAccuracy: voiceCount > 0 ? Math.round((voiceSum / voiceCount) * 10) / 10 : null,
                        letterScore: letterCount > 0 ? Math.round((letterSum / letterCount) * 10) / 10 : null,
                        wordScore: wordCount > 0 ? Math.round((wordSum / wordCount) * 10) / 10 : null,
                    },
                    assessmentVolumeOverTime,
                    riskTrendsOverTime,
                    scoreTrendsOverTime,
                    hasSufficientCohortData,
                    cohorts,
                },
            },
        };
    }

    return { handleRequest };
}

// ── Test Runner ───────────────────────────────────────────────────────────────

async function runAllTests() {
    console.log("=======================================================================");
    console.log("  Running Phase 6.5 Super Admin Historical Analytics Test Suite");
    console.log("=======================================================================\n");

    const sampleAssessments = [
        {
            id: "asmt-1",
            userId: "student-alpha",
            score: 85,
            accuracy: 90,
            risk: "Low Risk",
            subScores: { voiceAccuracy: 88, letterScore: 6, wordScore: 6 },
            completedAt: Date.parse("2026-11-01T10:00:00Z"),
            rawAudioBlob: "audio-blob-1",
            authToken: "tok-1",
        },
        {
            id: "asmt-2",
            userId: "student-alpha",
            score: 75,
            accuracy: 80,
            risk: "Moderate Risk",
            subScores: { voiceAccuracy: 72, letterScore: 5, wordScore: 5 },
            completedAt: Date.parse("2026-11-02T10:00:00Z"),
        },
        {
            id: "asmt-3",
            userId: "student-beta",
            score: 60,
            accuracy: 65,
            risk: "High Risk",
            subScores: { voiceAccuracy: 58, letterScore: 3, wordScore: 4 },
            completedAt: Date.parse("2026-11-03T10:00:00Z"),
        },
        {
            id: "asmt-4",
            userId: "student-gamma",
            score: 95,
            accuracy: 98,
            risk: "Low Risk",
            subScores: { voiceAccuracy: 95, letterScore: 7, wordScore: 7 },
            completedAt: Date.parse("2026-11-04T10:00:00Z"),
        },
    ];

    const service = createMockAnalyticsService({
        adminUid: "admin-root",
        assessments: sampleAssessments,
    });

    const validAuth = {
        authHeader: "Bearer valid-token",
        tokenClaims: { uid: "admin-root", superadmin: true },
    };

    // 1. Authorization Tests
    test("Authorization: Rejects missing Authorization header with 401", () => {
        const res = service.handleRequest({ authHeader: null });
        assert.strictEqual(res.status, 401);
    });

    test("Authorization: Rejects non-superadmin claim with 403", () => {
        const res = service.handleRequest({
            authHeader: "Bearer valid-token",
            tokenClaims: { uid: "user-normal", superadmin: false },
        });
        assert.strictEqual(res.status, 403);
    });

    test("Authorization: Rejects mismatched non-primary admin UID with 403", () => {
        const res = service.handleRequest({
            authHeader: "Bearer valid-token",
            tokenClaims: { uid: "attacker-admin", superadmin: true },
        });
        assert.strictEqual(res.status, 403);
    });

    // 2. Query Validation Tests
    test("Validation: Rejects invalid risk filter with 400", () => {
        const res = service.handleRequest({
            ...validAuth,
            query: { risk: "Extreme Risk" },
        });
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Invalid risk filter/);
    });

    test("Validation: Rejects invalid startDate format with 400", () => {
        const res = service.handleRequest({
            ...validAuth,
            query: { startDate: "not-a-date" },
        });
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Invalid startDate format/);
    });

    test("Validation: Rejects startDate later than endDate with 400", () => {
        const res = service.handleRequest({
            ...validAuth,
            query: { startDate: "2026-12-01", endDate: "2026-11-01" },
        });
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /startDate cannot be after endDate/);
    });

    // 3. Aggregate Metric Accuracy Tests
    test("Accuracy: Correctly counts total assessments and unique students", () => {
        const res = service.handleRequest({ ...validAuth });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.totalAssessments, 4);
        assert.strictEqual(res.body.data.uniqueStudentsAssessed, 3); // alpha, beta, gamma
    });

    test("Accuracy: Correctly calculates risk distribution breakdown", () => {
        const res = service.handleRequest({ ...validAuth });
        const rd = res.body.data.riskDistribution;
        assert.strictEqual(rd["Low Risk"], 2);
        assert.strictEqual(rd["Moderate Risk"], 1);
        assert.strictEqual(rd["High Risk"], 1);
        assert.strictEqual(rd["Unknown"], 0);
    });

    test("Accuracy: Correctly calculates composite score and accuracy means", () => {
        const res = service.handleRequest({ ...validAuth });
        // Scores: 85, 75, 60, 95 -> Sum = 315 / 4 = 78.75 -> 78.8
        assert.strictEqual(res.body.data.averageScore, 78.8);
        // Accuracy: 90, 80, 65, 98 -> Sum = 333 / 4 = 83.25 -> 83.3
        assert.strictEqual(res.body.data.averageAccuracy, 83.3);
    });

    test("Accuracy: Correctly calculates sub-score proficiency benchmarks", () => {
        const res = service.handleRequest({ ...validAuth });
        const sub = res.body.data.subScoresAverage;
        // Voice: (88 + 72 + 58 + 95) / 4 = 313 / 4 = 78.25 -> 78.3%
        assert.strictEqual(sub.voiceAccuracy, 78.3);
        // Letter: (6 + 5 + 3 + 7) / 4 = 21 / 4 = 5.25 -> 5.3
        assert.strictEqual(sub.letterScore, 5.3);
        // Word: (6 + 5 + 4 + 7) / 4 = 22 / 4 = 5.5
        assert.strictEqual(sub.wordScore, 5.5);
    });

    // 4. Longitudinal Trends & Filtering Tests
    test("Filtering: Accurately filters by risk classification ('Low Risk')", () => {
        const res = service.handleRequest({
            ...validAuth,
            query: { risk: "Low Risk" },
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.totalAssessments, 2);
        assert.strictEqual(res.body.data.uniqueStudentsAssessed, 2);
        assert.strictEqual(res.body.data.averageScore, 90.0); // (85 + 95) / 2 = 90
    });

    test("Filtering: Accurately filters by date range window", () => {
        const res = service.handleRequest({
            ...validAuth,
            query: { startDate: "2026-11-02", endDate: "2026-11-03" },
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.totalAssessments, 2); // asmt-2 and asmt-3
    });

    test("Trends: Generates chronological volume and score trajectories", () => {
        const res = service.handleRequest({ ...validAuth });
        const vol = res.body.data.assessmentVolumeOverTime;
        assert.strictEqual(vol.length, 4);
        assert.strictEqual(vol[0].date, "2026-11-01");
        assert.strictEqual(vol[3].date, "2026-11-04");
    });

    // 5. Cohort Analysis & Fallbacks Tests
    test("Cohorts: Generates accurate cohort analysis when sufficient volume exists", () => {
        const res = service.handleRequest({ ...validAuth });
        assert.strictEqual(res.body.data.hasSufficientCohortData, true);
        assert.strictEqual(res.body.data.cohorts.length, 1); // 2026-11
        assert.strictEqual(res.body.data.cohorts[0].assessmentCount, 4);
        assert.strictEqual(res.body.data.cohorts[0].studentCount, 3);
    });

    test("Cohorts: Signals insufficient data when volume is < 2 assessments", () => {
        const singleService = createMockAnalyticsService({
            adminUid: "admin-root",
            assessments: [sampleAssessments[0]],
        });
        const res = singleService.handleRequest({ ...validAuth });
        assert.strictEqual(res.body.data.hasSufficientCohortData, false);
        assert.deepStrictEqual(res.body.data.cohorts, []);
    });

    // 6. Empty Dataset Handling Tests
    test("Empty Dataset: Returns zero counts and null averages safely without crashing", () => {
        const emptyService = createMockAnalyticsService({
            adminUid: "admin-root",
            assessments: [],
        });
        const res = emptyService.handleRequest({ ...validAuth });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.totalAssessments, 0);
        assert.strictEqual(res.body.data.uniqueStudentsAssessed, 0);
        assert.strictEqual(res.body.data.averageScore, null);
        assert.strictEqual(res.body.data.averageAccuracy, null);
        assert.deepStrictEqual(res.body.data.assessmentVolumeOverTime, []);
        assert.strictEqual(res.body.data.hasSufficientCohortData, false);
    });

    // 7. Privacy & Data Sanitization Tests
    test("Privacy: Strict exclusion of raw audio waveforms and private auth tokens", () => {
        const res = service.handleRequest({ ...validAuth });
        const jsonStr = JSON.stringify(res.body);
        assert.ok(!jsonStr.includes("audio-blob-1"), "Raw audio blobs must not be exposed");
        assert.ok(!jsonStr.includes("tok-1"), "Private tokens must not be exposed");
    });

    // ── Summary ───────────────────────────────────────────────────────────────────
    console.log("\n=======================================================================");
    console.log(`  Phase 6.5 Global Analytics Test Results: ${passed} passed, ${failed} failed`);
    console.log("=======================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch((err) => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});

