import { expect, it } from "vitest";
import {
    DEFAULT_MOTION_METRIC_THRESHOLDS,
    MOTION_METRIC_KEYS,
    resolveThresholds,
} from "../motionMetricThresholds";

it("既知の全指標を補完し、明示された欠損も既定値へ戻す", () => {
    const override = { pass: 0, warn: 0, fail: 0 };
    const result = resolveThresholds({
        generatedAtIso: "2026-09-06T00:00:00.000Z",
        thresholdVersion: "initial-v1",
        thresholds: { neutralJitter: override, elbowFlipCount: undefined },
    });
    expect(Object.keys(result)).toEqual(MOTION_METRIC_KEYS);
    expect(result).toEqual({ ...DEFAULT_MOTION_METRIC_THRESHOLDS, neutralJitter: override });
    expect(resolveThresholds({ generatedAtIso: "", thresholdVersion: "initial-v1" })).toEqual(
        DEFAULT_MOTION_METRIC_THRESHOLDS,
    );
    expect(result).not.toBe(DEFAULT_MOTION_METRIC_THRESHOLDS);
});
