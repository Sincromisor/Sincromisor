import { describe, expect, it } from "vitest";
import { parseMotionDebugLogLines } from "../motionDebugLogSchema";
import { calculateMotionMetricSummary } from "../motionMetrics";
import { type MotionQaRegressionConfig, runMotionQaRegression } from "../motionQaRegression";
import {
    BASE_CONFIG,
    createBaseline,
    createLogText,
    GENERATED_AT_ISO,
    logLines,
} from "./motionQaRegressionTestFixtures";

describe("runMotionQaRegression", () => {
    it("passes all fixtures when matching baselines are provided", async () => {
        const neutralLog = createLogText("neutral-10s");
        const waveLog = createLogText("fast-wave");

        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [
                    {
                        fixtureId: "neutral-10s",
                        logText: neutralLog,
                        baseline: createBaseline("neutral-10s", neutralLog),
                    },
                    {
                        fixtureId: "fast-wave",
                        logText: waveLog,
                        baseline: createBaseline("fast-wave", waveLog),
                    },
                ],
            },
            config: BASE_CONFIG,
        });

        expect(result.overall).toBe("pass");
        expect(result.fixtures.map((fixture) => fixture.status)).toEqual(["pass", "pass"]);
    });

    it("fails a fixture when baseline comparison regresses with a severity change", async () => {
        const config: MotionQaRegressionConfig = {
            ...BASE_CONFIG,
            thresholds: {
                trackerBudgetOverrunFrameCount: { pass: 0, warn: 0, fail: 0 },
            },
        };
        const baselineLog = createLogText("neutral-10s", 0);
        const candidateLog = createLogText("neutral-10s", 1);

        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [
                    {
                        fixtureId: "neutral-10s",
                        logText: candidateLog,
                        baseline: createBaseline("neutral-10s", baselineLog, config),
                    },
                ],
            },
            config,
        });

        expect(result.overall).toBe("fail");
        expect(result.fixtures[0]).toMatchObject({
            status: "fail",
            comparison: {
                trackerBudgetOverrunFrameCount: {
                    status: "regressed",
                    severityChanged: true,
                },
            },
        });
    });

    it("warns when a regression keeps the same severity", async () => {
        const config: MotionQaRegressionConfig = {
            ...BASE_CONFIG,
            thresholds: {
                trackerBudgetOverrunFrameCount: { pass: 0, warn: 10, fail: 20 },
            },
        };
        const baselineLog = createLogText("neutral-10s", 1);
        const candidateLog = createLogText("neutral-10s", 2);

        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [
                    {
                        fixtureId: "neutral-10s",
                        logText: candidateLog,
                        baseline: createBaseline("neutral-10s", baselineLog, config),
                    },
                ],
            },
            config,
        });

        expect(result.overall).toBe("warn");
        expect(result.fixtures[0]).toMatchObject({
            status: "warn",
            comparison: {
                trackerBudgetOverrunFrameCount: {
                    status: "regressed",
                    severityChanged: false,
                },
            },
        });
    });

    it("fails fixtures with missing log sources", async () => {
        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [{ fixtureId: "neutral-10s" }],
            },
            config: BASE_CONFIG,
        });

        expect(result.overall).toBe("fail");
        expect(result.fixtures[0]).toMatchObject({
            fixtureId: "neutral-10s",
            status: "invalid_fixture",
        });
    });

    it("marks logUrl fixtures unsupported without caller-provided fetchLogText", async () => {
        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [{ fixtureId: "neutral-10s", logUrl: "/fixtures/neutral.ndjson" }],
            },
            config: BASE_CONFIG,
        });

        expect(result.overall).toBe("fail");
        expect(result.fixtures[0]).toMatchObject({
            fixtureId: "neutral-10s",
            status: "unsupported_source",
        });
    });

    it("echoes subjective checklist items without using them for machine status", async () => {
        const logText = createLogText("neutral-10s");

        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [
                    {
                        fixtureId: "neutral-10s",
                        logText,
                        baseline: createBaseline("neutral-10s", logText),
                        subjectiveChecklist: ["natural", "stable", "intentReadable", "noBreakage"],
                    },
                ],
            },
            config: BASE_CONFIG,
        });

        expect(result.overall).toBe("pass");
        expect(result.fixtures[0]?.subjectiveChecklist).toEqual([
            "natural",
            "stable",
            "intentReadable",
            "noBreakage",
        ]);
    });

    it("warns when an older baseline is missing a current metric key", async () => {
        const logText = createLogText("neutral-10s");
        const baseline = createBaseline("neutral-10s", logText);
        const parsedBaseline = parseMotionDebugLogLines(logLines(logText));
        if (!parsedBaseline.ok) {
            throw new Error("Synthetic log should parse.");
        }
        const summary = calculateMotionMetricSummary(parsedBaseline.frames, {
            fixtureId: "neutral-10s",
            generatedAtIso: GENERATED_AT_ISO,
            thresholdVersion: "initial-v1",
        });
        const oldMetrics = Object.fromEntries(
            Object.entries(summary.metrics).filter(([key]) => key !== "roiPausedFrameCount"),
        );

        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [
                    {
                        fixtureId: "neutral-10s",
                        logText,
                        baseline: {
                            ...baseline,
                            metricSummary: {
                                ...summary,
                                metrics: oldMetrics,
                            },
                        },
                    },
                ],
            },
            config: BASE_CONFIG,
        });

        expect(result.overall).toBe("warn");
        expect(result.fixtures[0]).toMatchObject({
            status: "warn",
            errors: [
                "Baseline metric roiPausedFrameCount is missing and was treated as not_available.",
            ],
        });
    });
});
