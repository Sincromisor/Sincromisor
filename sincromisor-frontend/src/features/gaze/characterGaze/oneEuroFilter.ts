// 1次元向け One Euro Filter。
// 低速時は平滑化を強め、高速時は追従性を上げることで、顔追従の「カクつき」と「遅れ」を両立して抑える。
export class OneEuroFilter1D {
    private minCutoff: number;
    private beta: number;
    private dCutoff: number;
    private prevValue?: number;
    private prevFilteredDerivative = 0;
    private prevTimestampMs?: number;

    constructor(minCutoff: number, beta: number, dCutoff: number = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }

    reset(): void {
        this.prevValue = undefined;
        this.prevFilteredDerivative = 0;
        this.prevTimestampMs = undefined;
    }

    filter(value: number, timestampMs: number): number {
        if (this.prevValue === undefined || this.prevTimestampMs === undefined) {
            this.prevValue = value;
            this.prevTimestampMs = timestampMs;
            return value;
        }

        const dtSec = Math.max(1e-3, (timestampMs - this.prevTimestampMs) / 1000);
        const derivative = (value - this.prevValue) / dtSec;
        const filteredDerivative = this.exponentialSmoothing(
            derivative,
            this.prevFilteredDerivative,
            this.alpha(this.dCutoff, dtSec),
        );
        this.prevFilteredDerivative = filteredDerivative;

        const adaptiveCutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);
        const filteredValue = this.exponentialSmoothing(
            value,
            this.prevValue,
            this.alpha(adaptiveCutoff, dtSec),
        );

        this.prevValue = filteredValue;
        this.prevTimestampMs = timestampMs;
        return filteredValue;
    }

    private alpha(cutoff: number, dtSec: number): number {
        const tau = 1 / (2 * Math.PI * Math.max(1e-3, cutoff));
        return 1 / (1 + tau / dtSec);
    }

    private exponentialSmoothing(value: number, prev: number, alpha: number): number {
        return alpha * value + (1 - alpha) * prev;
    }

    setParams(params: Partial<{ minCutoff: number; beta: number; dCutoff: number }>): void {
        if (isFiniteNumber(params.minCutoff)) {
            this.minCutoff = Math.max(0.01, params.minCutoff);
        }
        if (isFiniteNumber(params.beta)) {
            this.beta = Math.max(0, params.beta);
        }
        if (isFiniteNumber(params.dCutoff)) {
            this.dCutoff = Math.max(0.01, params.dCutoff);
        }
    }
}

function isFiniteNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
