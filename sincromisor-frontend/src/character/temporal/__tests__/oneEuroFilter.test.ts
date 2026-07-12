import { describe, expect, it } from "vitest";

import { OneEuroFilter1D } from "../oneEuroFilter";

describe("OneEuroFilter1D", () => {
    it("uses the first sample as the initial filtered value", () => {
        const filter = new OneEuroFilter1D({ minCutoff: 1, beta: 0, dCutoff: 1 });

        expect(filter.update(0.42, 0)).toBe(0.42);
    });

    it("filters subsequent scalar samples deterministically", () => {
        const filter = new OneEuroFilter1D({ minCutoff: 1, beta: 0, dCutoff: 1 });

        filter.update(0, 0);
        const filtered = filter.update(1, 100);

        expect(filtered).toBeCloseTo(0.3858695, 6);
    });

    it("does not update internal state when dt is invalid", () => {
        const filter = new OneEuroFilter1D({ minCutoff: 1, beta: 0, dCutoff: 1 });

        filter.update(0, 0);
        expect(filter.update(1, 0)).toBe(0);
        expect(filter.update(1, 100)).toBeCloseTo(0.3858695, 6);
    });

    it("clears internal state on reset", () => {
        const filter = new OneEuroFilter1D({ minCutoff: 1, beta: 0, dCutoff: 1 });

        filter.update(0, 0);
        filter.update(1, 100);
        filter.reset();

        expect(filter.update(0.25, 100)).toBe(0.25);
    });
});
