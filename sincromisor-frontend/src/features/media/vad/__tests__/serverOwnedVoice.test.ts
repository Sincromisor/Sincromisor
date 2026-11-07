import { afterEach, expect, it, vi } from "vitest";
import { UserMediaAudioProcessor } from "../userMediaAudioProcessor";

class Node {
    connect() {}
}
class Gain extends Node {
    gain = { value: 1, setTargetAtTime: vi.fn() };
}
class Worklet extends Node {
    static latest: Worklet;
    port = {
        postMessage: vi.fn(),
        onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
    };
    constructor() {
        super();
        Worklet.latest = this;
    }
}
class Context {
    static latest: Context;
    audioWorklet = { addModule: async () => {} };
    gain = new Gain();
    currentTime = 0;
    state = "running";
    constructor() {
        Context.latest = this;
    }
    createMediaStreamSource() {
        return new Node();
    }
    createBiquadFilter() {
        return Object.assign(new Node(), { Q: { value: 0 }, frequency: { value: 0 } });
    }
    createGain() {
        return this.gain;
    }
    createMediaStreamDestination() {
        return Object.assign(new Node(), { stream: new MediaStream() });
    }
    async close() {}
}
Object.defineProperty(Context.prototype, "audioWorklet", { value: undefined });

afterEach(() => vi.unstubAllGlobals());

it("通常会話は保存gateを軽量ゲートへ渡し、診断終了後・再取得時も学習Workerを動かさない", async () => {
    const workers: {
        terminate: ReturnType<typeof vi.fn>;
        onmessage?: (e: { data: unknown }) => void;
    }[] = [];
    vi.stubGlobal(
        "Worker",
        class {
            terminate = vi.fn();
            postMessage() {}
            constructor() {
                workers.push(this);
            }
        },
    );
    vi.stubGlobal(
        "MediaStreamTrack",
        class {
            stop() {}
        },
    );
    vi.stubGlobal(
        "MediaStream",
        class {
            getAudioTracks() {
                return [new MediaStreamTrack()];
            }
            getTracks() {
                return this.getAudioTracks();
            }
        },
    );
    vi.stubGlobal("AudioWorkletNode", Worklet);
    vi.stubGlobal("window", { AudioContext: Context });
    const processor = new UserMediaAudioProcessor();
    processor.setVadGateEnabled(true);
    processor.setVadThresholdMode("learned");
    await processor.buildProcessedAudioTrack(new MediaStreamTrack());
    expect(workers).toHaveLength(0);
    expect(Worklet.latest.port.postMessage).toHaveBeenCalledWith({
        type: "silence-gate",
        enabled: true,
    });
    processor.setVadGateEnabled(false);
    expect(Worklet.latest.port.postMessage).toHaveBeenLastCalledWith({
        type: "silence-gate",
        enabled: false,
    });
    processor.setVadGateEnabled(true);
    expect(Context.latest.gain.gain.value).toBe(1);
    Context.latest.gain.gain.setTargetAtTime.mockClear();
    const silence = { type: "vad", isSpeech: false, rms: 0, peak: 0 };
    Worklet.latest.port.onmessage?.({ data: silence });
    expect(Context.latest.gain.gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(Worklet.latest.port.postMessage).toHaveBeenCalledWith({
        type: "learned-vad-stream",
        enabled: false,
    });
    processor.setDiagnosticVadEnabled(true);
    expect(processor.getVadThresholdMode()).toBe("learned");
    expect(workers).toHaveLength(1);
    expect(Worklet.latest.port.postMessage).toHaveBeenLastCalledWith({
        type: "silence-gate",
        enabled: false,
    });
    Worklet.latest.port.onmessage?.({ data: silence });
    expect(Context.latest.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
    processor.setDiagnosticVadEnabled(false);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(Worklet.latest.port.postMessage).toHaveBeenLastCalledWith({
        type: "silence-gate",
        enabled: true,
    });
    expect(Context.latest.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.02);
    workers[0].onmessage?.({ data: { type: "vad-prob", probability: 1, isSpeech: true } });
    processor.setVadThresholdMode("learned");
    await processor.buildProcessedAudioTrack(new MediaStreamTrack());
    expect(workers).toHaveLength(1);
    expect(Context.latest.gain.gain.value).toBe(1);
    expect(Worklet.latest.port.postMessage).toHaveBeenLastCalledWith({
        type: "silence-gate",
        enabled: true,
    });
    processor.setDiagnosticVadEnabled(true);
    expect(workers).toHaveLength(2);
    processor.dispose();
});
