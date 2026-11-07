import { describe, expect, it } from "vitest";
import { SileroVadStream } from "../sileroVadStream";

describe("連続PCMの512サンプル化", () => {
    for (const sampleRate of [16000, 44100, 48000]) {
        it(`${sampleRate}Hzでブロック境界による欠落・重複を作らない`, () => {
            const input = Float32Array.from({ length: sampleRate }, (_, i) => i / sampleRate);
            const whole = new SileroVadStream().push(input, sampleRate).flatMap((f) => [...f]);
            const stream = new SileroVadStream();
            const split: number[] = [];
            for (let i = 0; i < input.length; i += 1536) {
                split.push(
                    ...stream.push(input.subarray(i, i + 1536), sampleRate).flatMap((f) => [...f]),
                );
            }
            expect(split).toHaveLength(31 * 512);
            expect(split).toEqual(whole);
            split.forEach((value, i) => {
                expect(value).toBeCloseTo(i / 16000, 6);
            });
        });
    }
    it("端数をゼロ詰めせず蓄積し、リセットで破棄する", () => {
        const stream = new SileroVadStream();
        expect(stream.push(new Float32Array(500).fill(1), 16000)).toEqual([]);
        const frames = stream.push(new Float32Array(12).fill(2), 16000);
        expect(frames[0].slice(500)).toEqual(new Float32Array(12).fill(2));
        stream.push(new Float32Array(500).fill(1), 16000);
        stream.reset();
        expect(stream.push(new Float32Array(512), 16000)[0]).toEqual(new Float32Array(512));
    });
});
