import type { TemporalWarningCode } from "./temporalUpperBodyState";

export function uniqueWarnings(warnings: TemporalWarningCode[]): TemporalWarningCode[] {
    const unique: TemporalWarningCode[] = [];
    for (const warning of warnings) {
        if (!unique.includes(warning)) {
            unique.push(warning);
        }
    }
    return unique;
}
