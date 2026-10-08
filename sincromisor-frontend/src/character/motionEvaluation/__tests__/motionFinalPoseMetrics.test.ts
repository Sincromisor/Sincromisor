import { describe, expect, it } from "vitest";
import { calculateFinalPoseMetrics, type MotionFinalPoseSample } from "../motionFinalPoseMetrics";

const rotation = (angle: number, sign = 1) => ({
    x: 0,
    y: 0,
    z: sign * Math.sin(angle / 2),
    w: sign * Math.cos(angle / 2),
});
const options = { bone: "rightUpperArm" as const, startMs: 0, endMs: 3000, maxLagMs: 500 };
describe("最終姿勢の指標", () => {
    it("一定回転とクォータニオンの符号反転を揺れに数えない", () => {
        const samples = [0, 100, 230].map((mediaTimeMs, i) => ({
            mediaTimeMs,
            finalPose: { rightUpperArm: rotation(0.4, i % 2 ? -1 : 1) },
            inputAngleRad: i,
        }));
        const result = calculateFinalPoseMetrics(samples, options);
        expect(result.rotationStepRmsRad).toBe(0);
        expect(result.unavailableReason).toBe("output_motion_absent");
        expect(result.lag).toBeNull();
    });
    it("既知の200msの遅れと半分の振幅を分離する", () => {
        const signal = (t: number) =>
            t < 400 ? 0 : t < 1200 ? (t - 400) / 800 : t < 2000 ? (2000 - t) / 800 : 0;
        const samples: MotionFinalPoseSample[] = Array.from({ length: 31 }, (_, i) => ({
            mediaTimeMs: i * 100,
            finalPose: { rightUpperArm: rotation(0.5 * signal(i * 100 - 200)) },
            inputAngleRad: signal(i * 100),
            recovering: i >= 15 && i <= 17,
        }));
        const result = calculateFinalPoseMetrics(samples, options);
        expect(result.lag?.lagMs).toBe(200);
        expect(result.amplitudeRatio).toBeCloseTo(0.5);
        expect(result.recoveryMaxAngleRad).toBeCloseTo(0.0625);
        expect(result.recoverySampleCount).toBe(4);
        expect(result.sampleCount).toBe(31);
    });
});
