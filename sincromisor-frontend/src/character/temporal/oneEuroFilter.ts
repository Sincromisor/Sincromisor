export type OneEuroFilterConfig = {
    minCutoff: number;
    beta: number;
    dCutoff: number;
};

export class OneEuroFilter1D {
    readonly #config: OneEuroFilterConfig;
    #previousValue: number | undefined;
    #previousDerivative = 0;

    constructor(config: OneEuroFilterConfig) {
        this.#config = { ...config };
    }

    update(value: number, dtMs: number): number {
        if (this.#previousValue === undefined) {
            this.#previousValue = value;
            this.#previousDerivative = 0;
            return value;
        }
        if (!Number.isFinite(dtMs) || dtMs <= 0) {
            return this.#previousValue;
        }

        const frequency = 1000 / dtMs;
        const derivative = (value - this.#previousValue) * frequency;
        const filteredDerivative = this.#smooth(
            derivative,
            this.#previousDerivative,
            this.#alpha(this.#config.dCutoff, dtMs),
        );
        const cutoff = this.#config.minCutoff + this.#config.beta * Math.abs(filteredDerivative);
        const filteredValue = this.#smooth(value, this.#previousValue, this.#alpha(cutoff, dtMs));

        this.#previousValue = filteredValue;
        this.#previousDerivative = filteredDerivative;
        return filteredValue;
    }

    reset(): void {
        this.#previousValue = undefined;
        this.#previousDerivative = 0;
    }

    #alpha(cutoff: number, dtMs: number): number {
        const tau = 1 / (2 * Math.PI * cutoff);
        const elapsedSec = dtMs / 1000;
        return 1 / (1 + tau / elapsedSec);
    }

    #smooth(value: number, previousValue: number, alpha: number): number {
        return alpha * value + (1 - alpha) * previousValue;
    }
}
