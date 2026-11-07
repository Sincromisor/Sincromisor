import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("onnxruntime-web/wasm", async (importOriginal) => {
    const actual = await importOriginal<typeof import("onnxruntime-web/wasm")>();
    return {
        ...actual,
        InferenceSession: {
            create: async () => ({
                inputNames: ["input", "state", "sr"],
                outputNames: ["output", "stateN"],
                run: mocks.run,
            }),
        },
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    mocks.run.mockReset();
});

async function boot() {
    const { Tensor } = await import("onnxruntime-web/wasm");
    const output = (p = 0.9) => ({
        output: new Tensor("float32", new Float32Array([p]), [1, 1]),
        stateN: new Tensor("float32", new Float32Array(256).fill(0.5), [2, 1, 128]),
    });
    mocks.run.mockImplementation(async () => output());
    const worker = { postMessage: vi.fn(), onmessage: async (_e: { data: unknown }) => {} };
    vi.stubGlobal("self", worker);
    await import("../sileroVad.worker");
    const send = (data: unknown) => worker.onmessage({ data });
    await send({ type: "init" });
    await send({ type: "set-enabled", enabled: true });
    return { worker, send, output };
}

it("6個の32ms音声をすべて推論し、発話開始は通知間隔より早く伝える", async () => {
    const { worker, send, output } = await boot();
    await send({ type: "set-params", minReportIntervalMs: 400, hangoverMs: 0 });
    for (let i = 0; i < 6; i++)
        await send({ type: "audio-frame", pcm: new Float32Array(1536), sampleRate: 48000 });
    expect(mocks.run).toHaveBeenCalledTimes(6);
    expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "vad-prob", isSpeech: true }),
    );
    worker.postMessage.mockClear();
    mocks.run.mockImplementation(async () => output(0));
    for (let i = 0; i < 2; i++)
        await send({ type: "audio-frame", pcm: new Float32Array(512), sampleRate: 48000 });
    // 48kHzでは上記2ブロックだけでは1フレーム未満。残りを渡して終了条件を満たす。
    await send({ type: "audio-frame", pcm: new Float32Array(2048), sampleRate: 48000 });
    expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "vad-prob", isSpeech: false }),
    );
});

it("処理中の停止・再開を跨いだ出力を捨て、新しい系列を直列に処理する", async () => {
    const { worker, send, output } = await boot();
    let finish: ((value: ReturnType<typeof output>) => void) | undefined;
    mocks.run.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const pending = send({ type: "audio-frame", pcm: new Float32Array(512), sampleRate: 16000 });
    await send({ type: "set-enabled", enabled: false });
    await send({ type: "set-enabled", enabled: true });
    await send({ type: "audio-frame", pcm: new Float32Array(512), sampleRate: 16000 });
    expect(mocks.run).toHaveBeenCalledTimes(1);
    worker.postMessage.mockClear();
    finish?.(output());
    await pending;
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run.mock.calls[1][0].state.data[0]).toBe(0);
    expect(worker.postMessage).not.toHaveBeenCalled();
});

it("1秒を超す待機音声ではRMSへ退避し、古い学習結果を通知しない", async () => {
    const { worker, send, output } = await boot();
    let finish: ((value: ReturnType<typeof output>) => void) | undefined;
    mocks.run.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const pending = send({ type: "audio-frame", pcm: new Float32Array(512), sampleRate: 16000 });
    await send({ type: "audio-frame", pcm: new Float32Array(512 * 32), sampleRate: 16000 });
    expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: "fallback" }),
    );
    worker.postMessage.mockClear();
    finish?.(output());
    await pending;
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(mocks.run).toHaveBeenCalledTimes(1);
});

it("入力レート変更は端数・状態を初期化する", async () => {
    const { send } = await boot();
    await send({ type: "audio-frame", pcm: new Float32Array(600).fill(1), sampleRate: 16000 });
    await send({ type: "audio-frame", pcm: new Float32Array(1536).fill(2), sampleRate: 48000 });
    expect(mocks.run).toHaveBeenCalledTimes(2);
    const feeds = mocks.run.mock.calls[1][0];
    expect(feeds.state.data[0]).toBe(0);
    expect(feeds.input.data[64]).toBe(2);
});
