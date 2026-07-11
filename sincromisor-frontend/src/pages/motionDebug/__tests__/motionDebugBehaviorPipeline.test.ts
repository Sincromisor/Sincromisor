import { describe, expect, it } from "vitest";
import { createDefaultReliabilityMap } from "../../../character/reliability/reliabilityMap";
import { createDefaultSincroMotionPipelineState } from "../../../character/runtime/sincroMotionPipelineState";
import { createDefaultTemporalUpperBodyState } from "../../../character/temporal/temporalUpperBodyState";
import { mergeMotionDebugBehaviorPipelineFrame } from "../motionDebugBehaviorPipeline";

describe("mergeMotionDebugBehaviorPipelineFrame", () => {
    it("publishes the current temporal frame while preserving downstream pipeline state", () => {
        const current = {
            ...createDefaultSincroMotionPipelineState(),
            composerDryRun: {
                status: "not_ready" as const,
                warnings: ["preserved"],
            },
        };
        const temporal = createDefaultTemporalUpperBodyState(120);
        const reliability = createDefaultReliabilityMap(120);

        const merged = mergeMotionDebugBehaviorPipelineFrame(current, {
            face: current.face,
            pose: current.pose,
            hand: undefined,
            reliability,
            temporal,
            updatedAtMs: 120,
        });

        expect(merged.temporal).toBe(temporal);
        expect(merged.reliability).toBe(reliability);
        expect(merged.composerDryRun).toBe(current.composerDryRun);
        expect(merged.hand).toBeUndefined();
        expect(merged.updatedAtMs).toBe(120);
    });
});
