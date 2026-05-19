import { MathUtils } from "three/src/math/MathUtils.js";
import type {
    SincroFaceRetargetedExpressions,
    SincroFaceRetargetedHeadPose,
    SincroFaceRotation,
} from "./sincroFaceRetargetTypes";

export function smoothSincroFaceHead(
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

export function smoothSincroFaceExpressions(
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

export function cloneSincroFaceHead(
    head: SincroFaceRetargetedHeadPose,
): SincroFaceRetargetedHeadPose {
    return {
        upperChest: { ...head.upperChest },
        neck: { ...head.neck },
        head: { ...head.head },
    };
}

export function scaleSincroFaceRotation(
    rotation: SincroFaceRotation,
    scale: number,
): SincroFaceRotation {
    return {
        x: rotation.x * scale,
        y: rotation.y * scale,
        z: rotation.z * scale,
    };
}

export function applySincroFaceDeadband(value: number, deadband: number): number {
    if (Math.abs(value) <= deadband) {
        return 0;
    }
    return value > 0 ? value - deadband : value + deadband;
}

export function smoothingAlpha(deltaMs: number, timeConstantMs: number): number {
    return 1 - Math.exp(-deltaMs / Math.max(1, timeConstantMs));
}

export function lerp(previous: number, next: number, alpha: number): number {
    return previous + (next - previous) * alpha;
}

export function clamp01(value: number): number {
    return MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function smoothRotation(
    previous: SincroFaceRotation,
    next: SincroFaceRotation,
    alpha: number,
): SincroFaceRotation {
    return {
        x: lerp(previous.x, next.x, alpha),
        y: lerp(previous.y, next.y, alpha),
        z: lerp(previous.z, next.z, alpha),
    };
}
