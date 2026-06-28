import { parseMotionDebugLogLines } from "./motionDebugLogSchema";
import {
    calculateMotionMetricSummary,
    compareMotionMetricSummaries,
    MOTION_METRIC_KEYS,
    MOTION_P0_FIXTURE_IDS,
    type MotionMetricComparison,
    type MotionMetricKey,
    type MotionMetricSummary,
    type MotionMetricThreshold,
    type MotionP0FixtureId,
} from "./motionMetrics";
import { parseRegressionBaseline } from "./motionQaRegressionBaseline";
import {
    logTextToLines,
    readManifestFixtures,
    type ValidManifestFixture,
    validateFixture,
} from "./motionQaRegressionManifest";

export type MotionQaSubjectiveChecklistItem =
    | "natural"
    | "stable"
    | "intentReadable"
    | "noBreakage";

export type MotionQaFixtureManifest = {
    schemaVersion: "sincro.motion-qa-fixture-manifest.v1";
    fixtures: Array<{
        fixtureId: MotionP0FixtureId;
        logText?: string;
        logUrl?: string;
        baseline?: unknown;
        subjectiveChecklist?: MotionQaSubjectiveChecklistItem[];
    }>;
};

export type MotionQaRegressionConfig = {
    generatedAtIso: string;
    thresholdVersion: "initial-v1" | "custom";
    thresholds?: Partial<Record<MotionMetricKey, MotionMetricThreshold>>;
    requireAllP0Fixtures?: boolean;
};

export type MotionQaRegressionInput = {
    manifest: unknown;
    config: MotionQaRegressionConfig;
    fetchLogText?: (url: string) => Promise<string>;
};

export type MotionQaFixtureResult = {
    fixtureId: MotionP0FixtureId | string;
    status: "pass" | "warn" | "fail" | "invalid_fixture" | "unsupported_source" | "missing_fixture";
    summary?: MotionMetricSummary;
    comparison?: Record<MotionMetricKey, MotionMetricComparison>;
    subjectiveChecklist: MotionQaSubjectiveChecklistItem[];
    errors: string[];
};

export type MotionQaRegressionResult = {
    schemaVersion: "sincro.motion-qa-regression.v1";
    overall: "pass" | "warn" | "fail";
    fixtures: MotionQaFixtureResult[];
};

function statusRank(status: MotionQaRegressionResult["overall"]): number {
    if (status === "pass") {
        return 0;
    }
    if (status === "warn") {
        return 1;
    }
    return 2;
}

function maxOverall(
    current: MotionQaRegressionResult["overall"],
    next: MotionQaRegressionResult["overall"],
): MotionQaRegressionResult["overall"] {
    return statusRank(next) > statusRank(current) ? next : current;
}

function statusToOverall(
    status: MotionQaFixtureResult["status"],
): MotionQaRegressionResult["overall"] {
    if (status === "pass") {
        return "pass";
    }
    if (status === "warn") {
        return "warn";
    }
    return "fail";
}

async function resolveFixtureLogText(
    fixture: ValidManifestFixture,
    input: MotionQaRegressionInput,
): Promise<{ ok: true; logText: string } | { ok: false; result: MotionQaFixtureResult }> {
    if (fixture.logText !== undefined) {
        return { ok: true, logText: fixture.logText };
    }
    if (fixture.logUrl === undefined) {
        return {
            ok: false,
            result: {
                fixtureId: fixture.fixtureId,
                status: "invalid_fixture",
                subjectiveChecklist: fixture.subjectiveChecklist,
                errors: ["Motion QA fixture log source is missing."],
            },
        };
    }
    if (input.fetchLogText === undefined) {
        return {
            ok: false,
            result: {
                fixtureId: fixture.fixtureId,
                status: "unsupported_source",
                subjectiveChecklist: fixture.subjectiveChecklist,
                errors: ["Motion QA fixture logUrl requires caller-provided fetchLogText."],
            },
        };
    }
    try {
        return { ok: true, logText: await input.fetchLogText(fixture.logUrl) };
    } catch (error) {
        return {
            ok: false,
            result: {
                fixtureId: fixture.fixtureId,
                status: "fail",
                subjectiveChecklist: fixture.subjectiveChecklist,
                errors: [`Motion QA fixture logUrl fetch failed: ${formatUnknownError(error)}`],
            },
        };
    }
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unknown error.";
}

function hasNotAvailableMetric(summary: MotionMetricSummary): boolean {
    return MOTION_METRIC_KEYS.some((key) => summary.metrics[key].status === "not_available");
}

function comparisonStatus(
    summary: MotionMetricSummary,
    comparison: Record<MotionMetricKey, MotionMetricComparison>,
    baselineWarnings: readonly string[],
): MotionQaFixtureResult["status"] {
    if (summary.severity === "fail") {
        return "fail";
    }
    if (
        MOTION_METRIC_KEYS.some(
            (key) => comparison[key].status === "regressed" && comparison[key].severityChanged,
        )
    ) {
        return "fail";
    }
    if (MOTION_METRIC_KEYS.some((key) => comparison[key].status === "regressed")) {
        return "warn";
    }
    if (baselineWarnings.length > 0) {
        return "warn";
    }
    return "pass";
}

function summaryStatus(summary: MotionMetricSummary): MotionQaFixtureResult["status"] {
    if (summary.severity === "fail") {
        return "fail";
    }
    if (summary.severity === "warn" || hasNotAvailableMetric(summary)) {
        return "warn";
    }
    return "pass";
}

async function runFixture(
    fixture: ValidManifestFixture,
    input: MotionQaRegressionInput,
): Promise<MotionQaFixtureResult> {
    const logText = await resolveFixtureLogText(fixture, input);
    if (!logText.ok) {
        return logText.result;
    }

    const parsedLog = parseMotionDebugLogLines(logTextToLines(logText.logText));
    if (!parsedLog.ok) {
        return {
            fixtureId: fixture.fixtureId,
            status: "fail",
            subjectiveChecklist: fixture.subjectiveChecklist,
            errors: parsedLog.errors.map((error) => `Log ${error.code}: ${error.message}`),
        };
    }

    const summary = calculateMotionMetricSummary(parsedLog.frames, {
        fixtureId: fixture.fixtureId,
        generatedAtIso: input.config.generatedAtIso,
        thresholdVersion: input.config.thresholdVersion,
        thresholds: input.config.thresholds,
    });
    if (fixture.baseline === undefined) {
        return {
            fixtureId: fixture.fixtureId,
            status: summaryStatus(summary),
            summary,
            subjectiveChecklist: fixture.subjectiveChecklist,
            errors: [],
        };
    }

    const baseline = parseRegressionBaseline(fixture.baseline);
    if (!baseline.ok) {
        return {
            fixtureId: fixture.fixtureId,
            status: "fail",
            summary,
            subjectiveChecklist: fixture.subjectiveChecklist,
            errors: baseline.errors,
        };
    }

    const comparison = compareMotionMetricSummaries(baseline.baseline.metricSummary, summary);
    return {
        fixtureId: fixture.fixtureId,
        status: comparisonStatus(summary, comparison, baseline.warnings),
        summary,
        comparison,
        subjectiveChecklist: fixture.subjectiveChecklist,
        errors: baseline.warnings,
    };
}

export async function runMotionQaRegression(
    input: MotionQaRegressionInput,
): Promise<MotionQaRegressionResult> {
    const fixtures = readManifestFixtures(input.manifest);
    if (fixtures === undefined || fixtures.length === 0) {
        return {
            schemaVersion: "sincro.motion-qa-regression.v1",
            overall: "fail",
            fixtures: [],
        };
    }

    const seenFixtureIds = new Set<MotionP0FixtureId>();
    const results: MotionQaFixtureResult[] = [];
    for (const fixture of fixtures) {
        const validation = validateFixture(fixture, seenFixtureIds);
        if (!validation.ok) {
            results.push(validation.result);
            continue;
        }
        results.push(await runFixture(validation.fixture, input));
    }

    if (input.config.requireAllP0Fixtures === true) {
        for (const fixtureId of MOTION_P0_FIXTURE_IDS) {
            if (!seenFixtureIds.has(fixtureId)) {
                results.push({
                    fixtureId,
                    status: "missing_fixture",
                    subjectiveChecklist: [],
                    errors: ["Motion QA manifest does not include this P0 fixture."],
                });
            }
        }
    }

    return {
        schemaVersion: "sincro.motion-qa-regression.v1",
        overall: results.reduce<MotionQaRegressionResult["overall"]>(
            (overall, fixture) => maxOverall(overall, statusToOverall(fixture.status)),
            "pass",
        ),
        fixtures: results,
    };
}
