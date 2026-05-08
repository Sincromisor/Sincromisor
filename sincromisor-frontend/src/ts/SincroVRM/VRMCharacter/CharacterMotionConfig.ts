import { MathUtils } from 'three/src/math/MathUtils.js';

// キャラクターの常時 idle motion 調整値。
// 各 controller が performance.now() を直接参照すると周期調整が散らばるため、時間係数と振幅をここに集約する。
export const CHARACTER_IDLE_MOTION_CONFIG = {
    breath: {
        periodSeconds: 4.2,
        spinePitchRad: MathUtils.degToRad(0.7),
        chestPitchRad: MathUtils.degToRad(1.1),
        upperChestPitchRad: MathUtils.degToRad(1.4),
        chestRollRad: MathUtils.degToRad(0.25),
        shoulderLiftRad: MathUtils.degToRad(0.8),
        shoulderRollRad: MathUtils.degToRad(0.35),
    },
    balance: {
        sidePeriodSeconds: 9.5,
        frontPeriodSeconds: 12.0,
        hipsSideShift: 0.012,
        hipsFrontShift: 0.006,
        hipsRollRad: MathUtils.degToRad(0.35),
        spineYawRad: MathUtils.degToRad(0.35),
    },
    listening: {
        attackSeconds: 0.35,
        releaseSeconds: 0.65,
        spineLeanRad: MathUtils.degToRad(1.4),
        chestLeanRad: MathUtils.degToRad(1.9),
        upperChestLeanRad: MathUtils.degToRad(1.2),
        hipsFrontShift: 0.008,
        nodDelayMs: 220,
        nodDurationSeconds: 0.62,
        nodCooldownMs: 2400,
        nodMinimumSpeechMs: 900,
        nodSpinePitchRad: MathUtils.degToRad(0.8),
        nodChestPitchRad: MathUtils.degToRad(1.6),
        envelopeRmsCeiling: 0.08,
        envelopePeakCeiling: 0.22,
    },
    arms: {
        swayPeriodSeconds: 5.8,
        elbowPeriodSeconds: 7.1,
        wristPeriodSeconds: 6.4,
        upperArmSwayRad: MathUtils.degToRad(0.55),
        lowerArmSwayRad: MathUtils.degToRad(0.45),
        wristSwayRad: MathUtils.degToRad(0.5),
        thumbSwayRad: MathUtils.degToRad(0.25),
    },
    legs: {
        swayPeriodSeconds: 6.8,
        kneeSwayRad: MathUtils.degToRad(0.15),
        footSwayRad: MathUtils.degToRad(0.12),
    },
} as const;

export function sineWave(elapsedSeconds: number, periodSeconds: number, phaseRad = 0): number {
    return Math.sin((elapsedSeconds / periodSeconds) * Math.PI * 2 + phaseRad);
}
