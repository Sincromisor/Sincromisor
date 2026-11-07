import { Tensor } from "onnxruntime-web/wasm";
import { describe, expect, it, vi } from "vitest";
import { SileroVadInference } from "../sileroVadInference";

function result(probability = 0.8) {
    return {
        output: new Tensor("float32", new Float32Array([probability]), [1, 1]),
        stateN: new Tensor("float32", new Float32Array(256).fill(0.25), [2, 1, 128]),
    };
}
function session(run = vi.fn(async (_feeds: Record<string, Tensor>) => result())) {
    return { inputNames: ["input", "state", "sr"], outputNames: ["output", "stateN"], run };
}

describe("Sileroの連続推論契約", () => {
    it("確率が先頭でも再帰状態と直前64サンプルを次の入力へ渡す", async () => {
        const model = session();
        const inference = new SileroVadInference(model);
        await inference.infer(new Float32Array(512).fill(0.1));
        await inference.infer(new Float32Array(512).fill(0.2));
        const first = model.run.mock.calls[0][0];
        const second = model.run.mock.calls[1][0];
        expect(first.input.dims).toEqual([1, 576]);
        expect(Array.from({ length: 64 }, (_, i) => Number(first.input.data[i]))).toEqual(
            new Array(64).fill(0),
        );
        expect(second.state.data[0]).toBe(0.25);
        expect(Number(second.input.data[0])).toBeCloseTo(0.1);
        expect(Number(second.input.data[64])).toBeCloseTo(0.2);
        expect(second.sr.dims).toEqual([]);
        inference.reset();
        await inference.infer(new Float32Array(512));
        const reset = model.run.mock.calls[2][0];
        expect(reset.state.data[0]).toBe(0);
        expect(reset.input.data[0]).toBe(0);
    });

    it("リセットを跨いだ推論結果を採用しない", async () => {
        let complete: ((value: ReturnType<typeof result>) => void) | undefined;
        const run = vi.fn(
            (_feeds: Record<string, Tensor>) =>
                new Promise<ReturnType<typeof result>>((resolve) => {
                    complete = resolve;
                }),
        );
        const inference = new SileroVadInference(session(run));
        const pending = inference.infer(new Float32Array(512));
        inference.reset();
        complete?.(result());
        expect(await pending).toBeUndefined();
    });

    it("不適合なモデルと入力長を拒否する", async () => {
        expect(() => new SileroVadInference({ ...session(), outputNames: ["output"] })).toThrow();
        await expect(
            new SileroVadInference(session()).infer(new Float32Array(256)),
        ).rejects.toThrow();
    });
});
