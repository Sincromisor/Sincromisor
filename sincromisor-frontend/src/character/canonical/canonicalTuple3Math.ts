import type { CanonicalTuple3 } from "./canonicalUpperBodyState";

export const MIN_CANONICAL_VECTOR_LENGTH = 1e-6;

export function tuple3(x: number, y: number, z: number): CanonicalTuple3 {
    return [x, y, z];
}

export function isFiniteNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function isFiniteTuple(value: CanonicalTuple3 | undefined): value is CanonicalTuple3 {
    return value?.every((component) => Number.isFinite(component)) === true;
}

export function clampConfidence(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

export function add(a: CanonicalTuple3, b: CanonicalTuple3): CanonicalTuple3 {
    return tuple3(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

export function subtract(a: CanonicalTuple3, b: CanonicalTuple3): CanonicalTuple3 {
    return tuple3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function scale(a: CanonicalTuple3, value: number): CanonicalTuple3 {
    return tuple3(a[0] * value, a[1] * value, a[2] * value);
}

export function dot(a: CanonicalTuple3, b: CanonicalTuple3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: CanonicalTuple3, b: CanonicalTuple3): CanonicalTuple3 {
    return tuple3(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
}

export function length(a: CanonicalTuple3): number {
    return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(value: CanonicalTuple3): CanonicalTuple3 | undefined {
    const vectorLength = length(value);
    if (!Number.isFinite(vectorLength) || vectorLength < MIN_CANONICAL_VECTOR_LENGTH) {
        return undefined;
    }
    return scale(value, 1 / vectorLength);
}

export function normalizedOrNeutral(
    value: CanonicalTuple3 | undefined,
    neutral: CanonicalTuple3,
): CanonicalTuple3 {
    if (!isFiniteTuple(value)) {
        return neutral;
    }
    return normalize(value) ?? neutral;
}

export function average(a: CanonicalTuple3, b: CanonicalTuple3): CanonicalTuple3 {
    return scale(add(a, b), 0.5);
}
