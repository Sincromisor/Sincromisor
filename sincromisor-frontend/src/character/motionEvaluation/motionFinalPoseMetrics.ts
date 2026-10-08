import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { VrmNormalizedLocalPose, VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";

/** 同じ入力時刻の本番合成結果。inputAngleRadは比較する部位の入力動作量で、人体の正解値ではない。 */
export type MotionFinalPoseSample = {
    mediaTimeMs: number;
    finalPose: VrmNormalizedLocalPose;
    inputAngleRad?: number;
    recovering?: boolean;
};

/** クォータニオンの符号を同一視する回転差。非有限・零ノルムは測定不能として返す。 */
export function finalPoseAngleRad(a: VrmPoseQuaternion, b: VrmPoseQuaternion): number | undefined {
    const norm = Math.hypot(a.x, a.y, a.z, a.w) * Math.hypot(b.x, b.y, b.z, b.w);
    if (!Number.isFinite(norm) || norm === 0) return undefined;
    return (
        2 * Math.acos(Math.min(1, Math.abs((a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / norm)))
    );
}

/**
 * 指定区間だけを集計する。遅れは系列内の入力動作と最終回転の相互相関であり、撮影から表示までの遅延ではない。
 * 不規則な入力時刻を保持し、遅れ候補は観測間隔から作る。停止候補は振幅と理由を必ず併記する。
 */
export function calculateFinalPoseMetrics(
    samples: readonly MotionFinalPoseSample[],
    options: { bone: VRMHumanBoneName; startMs: number; endMs: number; maxLagMs: number },
) {
    const selected = samples.filter(
        (s) =>
            s.mediaTimeMs >= options.startMs &&
            s.mediaTimeMs <= options.endMs &&
            s.finalPose[options.bone],
    );
    const reference = selected[0]?.finalPose[options.bone];
    const series = selected.flatMap((s) => {
        const angle = reference && finalPoseAngleRad(reference, s.finalPose[options.bone]!);
        return angle === undefined
            ? []
            : [
                  {
                      time: s.mediaTimeMs,
                      output: angle,
                      input: s.inputAngleRad,
                      recovering: s.recovering,
                      rotation: s.finalPose[options.bone]!,
                  },
              ];
    });
    const differences: number[] = [],
        velocities: number[] = [],
        recovery: number[] = [],
        intervals: number[] = [];
    for (let i = 1; i < series.length; i++) {
        const current = series[i],
            previous = series[i - 1];
        const dt = current.time - previous.time;
        if (dt <= 0) continue;
        const delta = finalPoseAngleRad(previous.rotation, current.rotation)!;
        differences.push(delta);
        velocities.push((delta * 1000) / dt);
        intervals.push(dt);
        if (current.recovering || previous.recovering) recovery.push(delta);
    }
    const inputs = series
        .filter((s) => Number.isFinite(s.input))
        .map((s) => ({ time: s.time, value: s.input! }));
    const inputAmplitudeRad = range(inputs.map((s) => s.value));
    const outputAmplitudeRad = range(series.map((s) => s.output));
    const candidates = [
        0,
        ...new Set(
            series.flatMap((s, i) =>
                series
                    .slice(0, i)
                    .map((p) => s.time - p.time)
                    .filter((dt) => dt <= options.maxLagMs),
            ),
        ),
    ];
    let lag: { lagMs: number; correlation: number; sampleCount: number } | undefined;
    if (inputAmplitudeRad > 1e-9 && outputAmplitudeRad > 1e-9)
        for (const lagMs of candidates) {
            const pairs = series.flatMap((s) => {
                const input = interpolate(inputs, s.time - lagMs);
                return input === undefined ? [] : [[input, s.output] as const];
            });
            const correlation = correlate(pairs);
            if (correlation !== undefined && (!lag || correlation > lag.correlation))
                lag = { lagMs, correlation, sampleCount: pairs.length };
        }
    return {
        ...options,
        sampleCount: series.length,
        differenceSampleCount: differences.length,
        intervalsMs: { min: min(intervals), max: max(intervals), median: median(intervals) },
        rotationStepRmsRad: rms(differences),
        angularVelocityRmsRadPerSec: rms(velocities),
        inputAmplitudeRad,
        outputAmplitudeRad,
        amplitudeRatio: inputAmplitudeRad > 1e-9 ? outputAmplitudeRad / inputAmplitudeRad : null,
        lag: lag ?? null,
        recoveryMaxAngleRad: max(recovery),
        recoverySampleCount: recovery.length,
        unavailableReason:
            series.length < 2
                ? "insufficient_samples"
                : outputAmplitudeRad <= 1e-9
                  ? "output_motion_absent"
                  : inputAmplitudeRad <= 1e-9
                    ? "input_motion_absent"
                    : undefined,
    };
}

function interpolate(samples: { time: number; value: number }[], time: number): number | undefined {
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].time === time) return samples[i].value;
        if (i > 0 && samples[i - 1].time < time && time < samples[i].time)
            return (
                samples[i - 1].value +
                ((samples[i].value - samples[i - 1].value) * (time - samples[i - 1].time)) /
                    (samples[i].time - samples[i - 1].time)
            );
    }
    return undefined;
}
function correlate(pairs: readonly (readonly [number, number])[]): number | undefined {
    if (pairs.length < 3) return undefined;
    const meanX = pairs.reduce((a, p) => a + p[0], 0) / pairs.length,
        meanY = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    let cross = 0,
        x = 0,
        y = 0;
    for (const pair of pairs) {
        const dx = pair[0] - meanX,
            dy = pair[1] - meanY;
        cross += dx * dy;
        x += dx * dx;
        y += dy * dy;
    }
    return x * y <= 1e-18 ? undefined : cross / Math.sqrt(x * y);
}
function min(v: number[]) {
    return v.length ? Math.min(...v) : null;
}
function max(v: number[]) {
    return v.length ? Math.max(...v) : null;
}
function range(v: number[]) {
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
}
function rms(v: number[]) {
    return v.length ? Math.sqrt(v.reduce((sum, x) => sum + x * x, 0) / v.length) : null;
}
function median(v: number[]) {
    const sorted = [...v].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}
