import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(
    new URL("../../../../../public/worklets/vad-processor.js", import.meta.url),
    "utf8",
);

// 配信する実ファイルを登録入口から読み、通知は実際と同様に複製・移譲する。
function createProcessor() {
    const messages = [];
    let Processor;
    runInNewContext(source, {
        Float32Array,
        sampleRate: 48000,
        AudioWorkletProcessor: class {
            port = {
                postMessage(message, transfer = []) {
                    messages.push(structuredClone(message, { transfer }));
                },
            };
        },
        registerProcessor(name, processorClass) {
            expect(name).toBe("vad-processor");
            Processor = processorClass;
        },
    });
    return { processor: new Processor(), messages };
}

it("無入力は状態を進めず、出力の余分なチャンネルには最後の入力を複製する", () => {
    const { processor, messages } = createProcessor();
    expect(processor.process([], [])).toBe(true);
    expect(processor.process([[]], [])).toBe(true);
    expect(processor.process([[new Float32Array()]], [])).toBe(true);
    expect(processor.frameCounter).toBe(0);
    expect(messages).toEqual([]);
    const input = [Float32Array.of(0.25, -0.5), Float32Array.of(0.75, -1)];
    const output = Array.from({ length: 3 }, () => new Float32Array(2));
    expect(processor.process([input], [output])).toBe(true);
    expect(output).toEqual([input[0], input[1], input[1]]);
    expect(input[0]).toEqual(Float32Array.of(0.25, -0.5));
});

it("先頭チャンネルの振幅を4フレームごとに通知し、無音12フレームで発話保持を終える", () => {
    const { processor, messages } = createProcessor();
    const input = [[Float32Array.of(0.25, -0.25)]];
    for (let index = 0; index < 3; index += 1) processor.process(input, []);
    expect(messages).toEqual([]);
    processor.process(input, []);
    expect(messages[0]).toEqual({ type: "vad", isSpeech: true, rms: 0.25, peak: 0.25 });
    for (let index = 0; index < 8; index += 1) {
        processor.process([[new Float32Array(2), Float32Array.of(1, 1)]], []);
    }
    expect(messages.at(-1).isSpeech).toBe(true);
    for (let index = 0; index < 4; index += 1) processor.process([[new Float32Array(2)]], []);
    expect(messages.at(-1)).toEqual({ type: "vad", isSpeech: false, rms: 0, peak: 0 });
});

it("閾値の不正入力を無視し、有効値は範囲内へ制限する", () => {
    const { processor } = createProcessor();
    const send = (data) => processor.port.onmessage({ data });
    send(undefined);
    send({ type: "unknown", rmsThreshold: 1 });
    send({ type: "vad-threshold", rmsThreshold: Number.NaN, peakThreshold: "0.1" });
    expect(processor.rmsThreshold).toBe(0.015);
    expect(processor.peakThreshold).toBe(0.06);
    send({ type: "vad-threshold", rmsThreshold: -1, peakThreshold: 2 });
    expect(processor.rmsThreshold).toBe(0.001);
    expect(processor.peakThreshold).toBe(0.99);
    send({ type: "vad-threshold", rmsThreshold: 2, peakThreshold: -1 });
    expect(processor.rmsThreshold).toBe(0.2);
    expect(processor.peakThreshold).toBe(0.01);
});

it("PCMを1536標本ずつ移譲し、停止時の端数を再開後へ混ぜない", () => {
    const { processor, messages } = createProcessor();
    processor.process([[new Float32Array(1000).fill(0.25)]], []);
    processor.process([[new Float32Array(600).fill(0.5)]], []);
    const first = messages.find((message) => message.type === "audio-frame");
    expect(first.sampleRate).toBe(48000);
    expect(first.pcm).toEqual(
        Float32Array.from({ length: 1536 }, (_, i) => (i < 1000 ? 0.25 : 0.5)),
    );
    processor.port.onmessage({ data: { type: "learned-vad-stream", enabled: false } });
    processor.process([[new Float32Array(2000).fill(0.75)]], []);
    processor.port.onmessage({ data: { type: "learned-vad-stream", enabled: true } });
    processor.process([[new Float32Array(1536).fill(1)]], []);
    const frames = messages.filter((message) => message.type === "audio-frame");
    expect(frames).toHaveLength(2);
    expect(frames[1].pcm).toEqual(new Float32Array(1536).fill(1));
    expect(first.pcm[0]).toBe(0.25);
});
