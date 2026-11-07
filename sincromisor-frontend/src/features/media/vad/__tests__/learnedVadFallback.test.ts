import { afterEach, expect, it, vi } from "vitest";
import { UserMediaVadRuntime } from "../userMediaVadRuntime";

afterEach(() => vi.unstubAllGlobals());

it("Workerが代替状態になれば古い発話判定を捨ててWorkletのRMS判定を使う", () => {
    let worker: { onmessage?: (event: { data: unknown }) => void } | undefined;
    vi.stubGlobal(
        "Worker",
        class {
            onmessage?: (event: { data: unknown }) => void;
            constructor() {
                worker = this;
            }
            postMessage() {}
            terminate() {}
        },
    );
    const runtime = new UserMediaVadRuntime();
    runtime.setClientVadEnabled(true);
    runtime.setVadThresholdMode("learned");
    worker?.onmessage?.({ data: { type: "vad-prob", probability: 0.9, isSpeech: true } });
    const silence = { type: "vad", isSpeech: false, rms: 0, peak: 0 };
    expect(runtime.handleWorkletMessage(silence)?.isSpeech).toBe(true);
    worker?.onmessage?.({ data: { type: "status", status: "fallback" } });
    expect(runtime.handleWorkletMessage(silence)?.isSpeech).toBe(false);
    expect(runtime.handleWorkletMessage({ ...silence, isSpeech: true })?.isSpeech).toBe(true);
    runtime.dispose();
});
