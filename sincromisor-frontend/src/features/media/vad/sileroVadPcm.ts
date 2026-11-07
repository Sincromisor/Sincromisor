/** Worker入力境界のPCMをFloat32へ揃える。補間と512サンプル化はSileroVadStreamが所有する。 */
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

/** サンプルレートが不正なら既存の48kHz代替値を使う。 */
export function positiveNumberOrDefault(value: unknown, defaultValue: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : defaultValue;
}
