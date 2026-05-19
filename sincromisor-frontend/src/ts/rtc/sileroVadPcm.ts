export function rmsOf(pcm: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 1) {
        const value = pcm[i];
        sum += value * value;
    }
    return Math.sqrt(sum / Math.max(1, pcm.length));
}

export function linearResample(
    input: Float32Array,
    srcRate: number,
    dstRate: number,
): Float32Array {
    if (srcRate === dstRate) {
        return input;
    }
    const ratio = srcRate / dstRate;
    const outLength = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i += 1) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const i1 = Math.min(input.length - 1, i0 + 1);
        const t = x - i0;
        out[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return out;
}

export function normalizeWindow(input: Float32Array, targetSize: number): Float32Array {
    if (input.length === targetSize) {
        return input;
    }
    if (input.length > targetSize) {
        return input.subarray(input.length - targetSize);
    }
    const out = new Float32Array(targetSize);
    out.set(input, targetSize - input.length);
    return out;
}

export function normalizePcmFrame(raw: unknown): Float32Array | undefined {
    if (raw instanceof Float32Array) {
        return raw;
    }
    if (raw instanceof ArrayBuffer) {
        return new Float32Array(raw);
    }
    if (ArrayBuffer.isView(raw)) {
        return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    }
    if (Array.isArray(raw)) {
        const values = raw.map((value) => Number(value));
        if (values.some((value) => !Number.isFinite(value))) {
            return undefined;
        }
        return Float32Array.from(values);
    }
    return undefined;
}

export function positiveNumberOrDefault(value: unknown, defaultValue: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : defaultValue;
}
