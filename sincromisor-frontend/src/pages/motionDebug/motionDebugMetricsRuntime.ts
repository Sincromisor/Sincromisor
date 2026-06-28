import type { SincroMotionDebugFrame } from "../../character/motionEvaluation/motionDebugLogSchema";
import {
    calculateMotionMetricSummary,
    MOTION_P0_FIXTURE_IDS,
    type MotionMetricConfig,
    type MotionMetricSummary,
    type MotionP0FixtureId,
} from "../../character/motionEvaluation/motionMetrics";
import { runMotionQaRegression } from "../../character/motionEvaluation/motionQaRegression";
import { analyzeMotionOptimizationCandidates } from "../../character/motionPostProcessing/motionOptimizationCandidateReport";
import type { MotionDebugReplayRuntime } from "./motionDebugReplayRuntime";
import type {
    MotionDebugOptimizationCandidateApiResult,
    MotionDebugQaRegressionApiResult,
    MotionDebugQaRegressionConfig,
    MotionDebugReplayMetricsResult,
} from "./types";

type MotionDebugMetricsRuntimeParams = {
    replay: Pick<
        MotionDebugReplayRuntime,
        "player" | "replayManifest" | "replayFrames" | "createReplayLogText"
    >;
    setAutoViewerMode: (mode: "metrics") => void;
    renderSnapshot: () => void;
};

function isMotionP0FixtureId(value: unknown): value is MotionP0FixtureId {
    return MOTION_P0_FIXTURE_IDS.some((fixtureId) => fixtureId === value);
}

function replayManifestFixtureId(value: unknown): MotionP0FixtureId | undefined {
    return isMotionP0FixtureId(value) ? value : undefined;
}

export class MotionDebugMetricsRuntime {
    private latestMetricSummary?: MotionMetricSummary;

    constructor(private readonly params: MotionDebugMetricsRuntimeParams) {}

    calculateReplayMetrics(config: MotionMetricConfig): MotionDebugReplayMetricsResult {
        if (!this.params.replay.player.hasLoadedRecording()) {
            return {
                ok: false,
                code: "no_recording_loaded",
                message: "Motion replay has no loaded recording.",
            };
        }
        // metrics mode は replay log の解析結果だけを UI に載せ、runtime correction へ接続しない。
        const summary = calculateMotionMetricSummary(this.params.replay.replayFrames(), config);
        const result: MotionDebugReplayMetricsResult = {
            ok: true,
            summary,
        };
        this.latestMetricSummary = summary;
        this.params.setAutoViewerMode("metrics");
        this.params.renderSnapshot();
        return result;
    }

    async runQaRegression(
        config: MotionDebugQaRegressionConfig,
    ): Promise<MotionDebugQaRegressionApiResult> {
        if (!this.params.replay.player.hasLoadedRecording()) {
            return {
                ok: false,
                code: "no_recording_loaded",
                message: "Motion replay has no loaded recording.",
            };
        }

        const replayManifest = this.params.replay.replayManifest();
        const fixtureId =
            config.fixtureId ?? replayManifestFixtureId(replayManifest?.source.fixtureId);
        if (fixtureId === undefined || replayManifest === undefined) {
            return {
                ok: false,
                code: "fixture_id_required",
                message:
                    "Motion QA regression requires config.fixtureId when the loaded recording source.fixtureId is not a P0 fixture id.",
            };
        }

        const result = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [
                    {
                        fixtureId,
                        logText: this.params.replay.createReplayLogText(replayManifest),
                    },
                ],
            },
            config,
        });
        const firstFixture = result.fixtures[0];
        if (firstFixture?.summary !== undefined) {
            this.latestMetricSummary = firstFixture.summary;
        }
        this.params.setAutoViewerMode("metrics");
        this.params.renderSnapshot();
        return { ok: true, result };
    }

    async analyzeOptimizationCandidates(
        config: MotionDebugQaRegressionConfig,
    ): Promise<MotionDebugOptimizationCandidateApiResult> {
        const qaResult = await this.runQaRegression(config);
        if (!qaResult.ok) {
            return qaResult;
        }

        const framesByFixtureId: Partial<
            Record<MotionP0FixtureId, readonly SincroMotionDebugFrame[]>
        > = {};
        const firstFixtureId = qaResult.result.fixtures[0]?.fixtureId;
        if (isMotionP0FixtureId(firstFixtureId)) {
            framesByFixtureId[firstFixtureId] = this.params.replay.replayFrames();
        }

        return {
            ok: true,
            report: analyzeMotionOptimizationCandidates({
                qaResult: qaResult.result,
                framesByFixtureId,
                generatedAtIso: config.generatedAtIso,
            }),
        };
    }

    getLatestMetricSummary(): MotionMetricSummary | undefined {
        return this.latestMetricSummary;
    }
}
