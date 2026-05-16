import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroFaceMotionSnapshot } from "../../FaceTracking/SincroFaceMotionSnapshot";

export type SincroFaceRetargetedHeadPose = {
    upperChest: { x: number; y: number; z: number };
    neck: { x: number; y: number; z: number };
    head: { x: number; y: number; z: number };
};

export type SincroFaceRetargetedExpressions = {
    blink: number;
    blinkLeft: number;
    blinkRight: number;
    lookLeft: number;
    lookRight: number;
    lookUp: number;
    lookDown: number;
    aa: number;
    ih: number;
    ou: number;
    ee: number;
    oh: number;
};

export type SincroFaceRetargetFrame = {
    active: boolean;
    confidence: number;
    head: SincroFaceRetargetedHeadPose;
    expressions: SincroFaceRetargetedExpressions;
};

export type SincroFaceRetargetConfig = {
    minConfidence: number;
    neutralLearningMs: number;
    returnToNeutralMs: number;
    headSmoothingMs: number;
    expressionSmoothingMs: number;
    headDeadbandDeg: number;
    expressionDeadband: number;
    blinkCalibration: {
        openThreshold: number;
        closeThreshold: number;
        gamma: number;
    };
    mirrorYaw: boolean;
    headInputScale: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    maxHeadDeg: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    headBoneWeights: {
        upperChest: number;
        neck: number;
        head: number;
    };
};

export const DEFAULT_SINCRO_FACE_RETARGET_CONFIG: SincroFaceRetargetConfig = {
    minConfidence: 0.08,
    neutralLearningMs: 900,
    returnToNeutralMs: 420,
    headSmoothingMs: 115,
    expressionSmoothingMs: 70,
    headDeadbandDeg: 1.2,
    expressionDeadband: 0.035,
    blinkCalibration: {
        openThreshold: 0.22,
        closeThreshold: 0.62,
        gamma: 0.72,
    },
    mirrorYaw: false,
    headInputScale: {
        yaw: 0.58,
        pitch: 0.52,
        roll: 0.42,
    },
    maxHeadDeg: {
        yaw: 18,
        pitch: 12,
        roll: 9,
    },
    headBoneWeights: {
        upperChest: 0.18,
        neck: 0.52,
        head: 0.3,
    },
};

const NEUTRAL_EXPRESSIONS: SincroFaceRetargetedExpressions = {
    blink: 0,
    blinkLeft: 0,
    blinkRight: 0,
    lookLeft: 0,
    lookRight: 0,
    lookUp: 0,
    lookDown: 0,
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
};

const NEUTRAL_HEAD: SincroFaceRetargetedHeadPose = {
    upperChest: { x: 0, y: 0, z: 0 },
    neck: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
};

const MOUTH_OPEN_KEYS = ["jawOpen", "mouthOpen"] as const;
const MOUTH_CLOSE_KEYS = ["mouthClose"] as const;
const MOUTH_FUNNEL_KEYS = ["mouthFunnel"] as const;
const MOUTH_PUCKER_KEYS = ["mouthPucker"] as const;
const MOUTH_SMILE_LEFT_KEYS = ["mouthSmileLeft"] as const;
const MOUTH_SMILE_RIGHT_KEYS = ["mouthSmileRight"] as const;
const EYE_BLINK_LEFT_KEYS = ["eyeBlinkLeft"] as const;
const EYE_BLINK_RIGHT_KEYS = ["eyeBlinkRight"] as const;
const EYE_LOOK_LEFT_KEYS = ["eyeLookOutLeft", "eyeLookInRight"] as const;
const EYE_LOOK_RIGHT_KEYS = ["eyeLookInLeft", "eyeLookOutRight"] as const;
const EYE_LOOK_UP_KEYS = ["eyeLookUpLeft", "eyeLookUpRight"] as const;
const EYE_LOOK_DOWN_KEYS = ["eyeLookDownLeft", "eyeLookDownRight"] as const;

// MediaPipe snapshot から VRM に渡せる値へ変換する stateful retargeter。
// calibration と smoothing をここに閉じ込め、VRM controller が MediaPipe 名や軸補正を知らない構造にする。
export class SincroFaceRetargeter {
    private readonly config: SincroFaceRetargetConfig;
    private neutralPose: { yawDeg: number; pitchDeg: number; rollDeg: number } | null = null;
    private neutralStartedAtMs: number | null = null;
    private lastUpdateAtMs: number | null = null;
    private smoothedHead: SincroFaceRetargetedHeadPose = cloneHead(NEUTRAL_HEAD);
    private smoothedExpressions: SincroFaceRetargetedExpressions = { ...NEUTRAL_EXPRESSIONS };

    constructor(config: Partial<SincroFaceRetargetConfig> = {}) {
        this.config = {
            ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
            ...config,
            headInputScale: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.headInputScale,
                ...config.headInputScale,
            },
            maxHeadDeg: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.maxHeadDeg,
                ...config.maxHeadDeg,
            },
            headBoneWeights: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.headBoneWeights,
                ...config.headBoneWeights,
            },
            blinkCalibration: {
                ...DEFAULT_SINCRO_FACE_RETARGET_CONFIG.blinkCalibration,
                ...config.blinkCalibration,
            },
        };
    }

    retarget(snapshot: SincroFaceMotionSnapshot, nowMs: number): SincroFaceRetargetFrame {
        const deltaMs =
            this.lastUpdateAtMs == null
                ? 1000 / 60
                : MathUtils.clamp(nowMs - this.lastUpdateAtMs, 1, 100);
        this.lastUpdateAtMs = nowMs;

        if (!this.snapshotIsUsable(snapshot)) {
            this.neutralStartedAtMs = null;
            return this.smoothFrame(
                false,
                0,
                NEUTRAL_HEAD,
                NEUTRAL_EXPRESSIONS,
                deltaMs,
                this.config.returnToNeutralMs,
            );
        }

        this.updateNeutral(snapshot, nowMs);
        const targetHead = retargetSincroFaceHeadPose(snapshot, this.neutralPose, this.config);
        const targetExpressions = retargetSincroFaceExpressions(snapshot.blendshapes, this.config);
        return this.smoothFrame(true, snapshot.confidence, targetHead, targetExpressions, deltaMs);
    }

    reset(): void {
        this.neutralPose = null;
        this.neutralStartedAtMs = null;
        this.lastUpdateAtMs = null;
        this.smoothedHead = cloneHead(NEUTRAL_HEAD);
        this.smoothedExpressions = { ...NEUTRAL_EXPRESSIONS };
    }

    private snapshotIsUsable(snapshot: SincroFaceMotionSnapshot): boolean {
        return (
            snapshot.trackingEnabled &&
            snapshot.detected &&
            snapshot.confidence >= this.config.minConfidence
        );
    }

    private updateNeutral(snapshot: SincroFaceMotionSnapshot, nowMs: number): void {
        if (this.neutralStartedAtMs == null) {
            this.neutralStartedAtMs = nowMs;
            this.neutralPose = {
                yawDeg: snapshot.headPose.yawDeg,
                pitchDeg: snapshot.headPose.pitchDeg,
                rollDeg: snapshot.headPose.rollDeg,
            };
            return;
        }
        if (!this.neutralPose || nowMs - this.neutralStartedAtMs >= this.config.neutralLearningMs) {
            return;
        }

        const alpha = MathUtils.clamp(
            (nowMs - this.neutralStartedAtMs) / this.config.neutralLearningMs,
            0.08,
            0.35,
        );
        const currentNeutralPose = this.neutralPose;
        this.neutralPose = {
            yawDeg: lerp(currentNeutralPose.yawDeg, snapshot.headPose.yawDeg, alpha),
            pitchDeg: lerp(currentNeutralPose.pitchDeg, snapshot.headPose.pitchDeg, alpha),
            rollDeg: lerp(currentNeutralPose.rollDeg, snapshot.headPose.rollDeg, alpha),
        };
    }

    private smoothFrame(
        active: boolean,
        confidence: number,
        targetHead: SincroFaceRetargetedHeadPose,
        targetExpressions: SincroFaceRetargetedExpressions,
        deltaMs: number,
        headTimeConstantMs: number = this.config.headSmoothingMs,
    ): SincroFaceRetargetFrame {
        const headAlpha = smoothingAlpha(deltaMs, headTimeConstantMs);
        const expressionAlpha = smoothingAlpha(deltaMs, this.config.expressionSmoothingMs);
        this.smoothedHead = smoothHead(this.smoothedHead, targetHead, headAlpha);
        this.smoothedExpressions = smoothExpressions(
            this.smoothedExpressions,
            targetExpressions,
            expressionAlpha,
        );
        return {
            active,
            confidence,
            head: cloneHead(this.smoothedHead),
            expressions: { ...this.smoothedExpressions },
        };
    }
}

export function retargetSincroFaceHeadPose(
    snapshot: SincroFaceMotionSnapshot,
    neutralPose: { yawDeg: number; pitchDeg: number; rollDeg: number } | null,
    config: SincroFaceRetargetConfig = DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
): SincroFaceRetargetedHeadPose {
    const neutral = neutralPose ?? { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
    const yawSign = config.mirrorYaw ? -1 : 1;
    const yawDeg = applyDeadband(
        (snapshot.headPose.yawDeg - neutral.yawDeg) * config.headInputScale.yaw * yawSign,
        config.headDeadbandDeg,
    );
    const pitchDeg = applyDeadband(
        // MediaPipe の pitch と VRM 正規化ボーンの X 回転は上下方向の符号が逆になる。
        // sincro モードでは首・頭へ直接加算するため、retarget 境界で VRM 座標へ揃える。
        -(snapshot.headPose.pitchDeg - neutral.pitchDeg) * config.headInputScale.pitch,
        config.headDeadbandDeg,
    );
    const rollDeg = applyDeadband(
        (snapshot.headPose.rollDeg - neutral.rollDeg) * config.headInputScale.roll * yawSign,
        config.headDeadbandDeg,
    );
    const clamped = {
        x: MathUtils.degToRad(
            MathUtils.clamp(pitchDeg, -config.maxHeadDeg.pitch, config.maxHeadDeg.pitch),
        ),
        y: MathUtils.degToRad(
            MathUtils.clamp(yawDeg, -config.maxHeadDeg.yaw, config.maxHeadDeg.yaw),
        ),
        z: MathUtils.degToRad(
            MathUtils.clamp(-rollDeg, -config.maxHeadDeg.roll, config.maxHeadDeg.roll),
        ),
    };
    return {
        upperChest: scaleRotation(clamped, config.headBoneWeights.upperChest),
        neck: scaleRotation(clamped, config.headBoneWeights.neck),
        head: scaleRotation(clamped, config.headBoneWeights.head),
    };
}

export function retargetSincroFaceExpressions(
    blendshapes: Record<string, number>,
    config: Pick<
        SincroFaceRetargetConfig,
        "expressionDeadband" | "blinkCalibration"
    > = DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
): SincroFaceRetargetedExpressions {
    const blinkLeft = calibrateBlink(
        maxBlendshape(blendshapes, EYE_BLINK_LEFT_KEYS),
        config.blinkCalibration,
    );
    const blinkRight = calibrateBlink(
        maxBlendshape(blendshapes, EYE_BLINK_RIGHT_KEYS),
        config.blinkCalibration,
    );
    const blink = Math.max(blinkLeft, blinkRight);
    const jawOpen = maxBlendshape(blendshapes, MOUTH_OPEN_KEYS);
    const mouthClose = maxBlendshape(blendshapes, MOUTH_CLOSE_KEYS);
    const funnel = maxBlendshape(blendshapes, MOUTH_FUNNEL_KEYS);
    const pucker = maxBlendshape(blendshapes, MOUTH_PUCKER_KEYS);
    const smile =
        (maxBlendshape(blendshapes, MOUTH_SMILE_LEFT_KEYS) +
            maxBlendshape(blendshapes, MOUTH_SMILE_RIGHT_KEYS)) /
        2;
    const openness = MathUtils.clamp(jawOpen * (1 - mouthClose * 0.72), 0, 1);
    const rounded = Math.max(funnel, pucker);
    const spread = smile * (1 - rounded * 0.5);

    return {
        blink,
        blinkLeft,
        blinkRight,
        lookLeft: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_LEFT_KEYS),
            config.expressionDeadband,
        ),
        lookRight: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_RIGHT_KEYS),
            config.expressionDeadband,
        ),
        lookUp: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_UP_KEYS),
            config.expressionDeadband,
        ),
        lookDown: applyExpressionDeadband(
            maxBlendshape(blendshapes, EYE_LOOK_DOWN_KEYS),
            config.expressionDeadband,
        ),
        aa: applyExpressionDeadband(openness * (1 - rounded * 0.45), config.expressionDeadband),
        ih: applyExpressionDeadband(
            spread * 0.72 + openness * spread * 0.18,
            config.expressionDeadband,
        ),
        ou: applyExpressionDeadband(rounded * (0.35 + openness * 0.25), config.expressionDeadband),
        ee: applyExpressionDeadband(spread * 0.82, config.expressionDeadband),
        oh: applyExpressionDeadband(
            Math.max(funnel * 0.78, openness * rounded * 0.72),
            config.expressionDeadband,
        ),
    };
}

function smoothHead(
    previous: SincroFaceRetargetedHeadPose,
    next: SincroFaceRetargetedHeadPose,
    alpha: number,
): SincroFaceRetargetedHeadPose {
    return {
        upperChest: smoothRotation(previous.upperChest, next.upperChest, alpha),
        neck: smoothRotation(previous.neck, next.neck, alpha),
        head: smoothRotation(previous.head, next.head, alpha),
    };
}

function smoothExpressions(
    previous: SincroFaceRetargetedExpressions,
    next: SincroFaceRetargetedExpressions,
    alpha: number,
): SincroFaceRetargetedExpressions {
    return {
        blink: lerp(previous.blink, next.blink, alpha),
        blinkLeft: lerp(previous.blinkLeft, next.blinkLeft, alpha),
        blinkRight: lerp(previous.blinkRight, next.blinkRight, alpha),
        lookLeft: lerp(previous.lookLeft, next.lookLeft, alpha),
        lookRight: lerp(previous.lookRight, next.lookRight, alpha),
        lookUp: lerp(previous.lookUp, next.lookUp, alpha),
        lookDown: lerp(previous.lookDown, next.lookDown, alpha),
        aa: lerp(previous.aa, next.aa, alpha),
        ih: lerp(previous.ih, next.ih, alpha),
        ou: lerp(previous.ou, next.ou, alpha),
        ee: lerp(previous.ee, next.ee, alpha),
        oh: lerp(previous.oh, next.oh, alpha),
    };
}

function smoothRotation(
    previous: { x: number; y: number; z: number },
    next: { x: number; y: number; z: number },
    alpha: number,
): { x: number; y: number; z: number } {
    return {
        x: lerp(previous.x, next.x, alpha),
        y: lerp(previous.y, next.y, alpha),
        z: lerp(previous.z, next.z, alpha),
    };
}

function scaleRotation(
    rotation: { x: number; y: number; z: number },
    scale: number,
): { x: number; y: number; z: number } {
    return {
        x: rotation.x * scale,
        y: rotation.y * scale,
        z: rotation.z * scale,
    };
}

function cloneHead(head: SincroFaceRetargetedHeadPose): SincroFaceRetargetedHeadPose {
    return {
        upperChest: { ...head.upperChest },
        neck: { ...head.neck },
        head: { ...head.head },
    };
}

function maxBlendshape(blendshapes: Record<string, number>, keys: readonly string[]): number {
    let value = 0;
    for (const key of keys) {
        value = Math.max(value, clamp01(blendshapes[key] ?? 0));
    }
    return value;
}

function applyExpressionDeadband(value: number, deadband: number): number {
    const clamped = clamp01(value);
    if (clamped <= deadband) {
        return 0;
    }
    return MathUtils.clamp((clamped - deadband) / (1 - deadband), 0, 1);
}

function calibrateBlink(
    value: number,
    calibration: SincroFaceRetargetConfig["blinkCalibration"],
): number {
    const clamped = clamp01(value);
    if (clamped <= calibration.openThreshold) {
        return 0;
    }
    if (clamped >= calibration.closeThreshold) {
        return 1;
    }

    // MediaPipe の blink score は開眼時も閉眼時も端まで届きにくい。
    // しきい値間を smoothstep 化し、gamma で閉じ始めの反応を少し強める。
    const normalized =
        (clamped - calibration.openThreshold) /
        Math.max(0.001, calibration.closeThreshold - calibration.openThreshold);
    const eased = normalized * normalized * (3 - 2 * normalized);
    return MathUtils.clamp(eased ** calibration.gamma, 0, 1);
}

function applyDeadband(value: number, deadband: number): number {
    if (Math.abs(value) <= deadband) {
        return 0;
    }
    return value > 0 ? value - deadband : value + deadband;
}

function smoothingAlpha(deltaMs: number, timeConstantMs: number): number {
    return 1 - Math.exp(-deltaMs / Math.max(1, timeConstantMs));
}

function lerp(previous: number, next: number, alpha: number): number {
    return previous + (next - previous) * alpha;
}

function clamp01(value: number): number {
    return MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}
