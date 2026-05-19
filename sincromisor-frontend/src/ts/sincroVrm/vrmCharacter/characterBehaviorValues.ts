export function nonEmptyStringOrUndefined(value: string | undefined): string | undefined {
    return value === undefined || value === "" ? undefined : value;
}

export function nonNegativeNumberOrZero(value: unknown): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}
