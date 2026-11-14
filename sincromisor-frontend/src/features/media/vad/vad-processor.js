// 通常会話では診断用RMS下限と同じ振幅まで通す。保持時間は既存の学習VAD標準値に合わせる。
// 小声を必ず保護する値ではないため、ゲートは任意かつ既定で無効とする。
const SILENCE_GATE_THRESHOLD = 0.001;
const SILENCE_GATE_HOLD_SECONDS = 0.18;

/** 通常会話の軽量無音化と、診断用の発話通知・学習用PCM送信を担当する。 */
class VadProcessor extends AudioWorkletProcessor {
    /** 検出閾値とPCM蓄積領域を初期化し、メインスレッドからの設定変更を受け付ける。 */
    constructor() {
        super();
        // RMS閾値: 平均的なエネルギー量がこの値以上なら発話候補とみなす。
        this.rmsThreshold = 0.015;
        // Peak閾値: 瞬間的な振幅がこの値以上なら発話候補とみなす。
        this.peakThreshold = 0.06;
        // hangover: 発話検知後すぐにSilenceへ戻さないための保持フレーム数。
        this.hangoverFrames = 12;
        this.currentHangover = 0;
        this.silenceGateEnabled = false;
        this.silenceGateRemainingSamples = 0;
        // 毎フレーム通知するとUI更新負荷が高いため、数フレームごとに集約して通知する。
        this.reportEveryFrames = 4;
        this.frameCounter = 0;
        // 学習ベースVAD向けにPCMフレームを送るかどうか。
        // 診断で明示的に要求された場合だけ転送する。通常会話の開始直後にも余分な転送をしない。
        this.learnedVadStreamEnabled = false;
        this.learnedVadFrameSize = 1536; // 48kHzで約32ms。送信頻度を抑えてCPU負荷を下げる。
        this.learnedVadFrameBuffer = new Float32Array(this.learnedVadFrameSize);
        this.learnedVadFrameWriteIndex = 0;

        // 閾値は有限の数値だけを受けて範囲を制限する。PCM送信停止時は未送信の端数を破棄する。
        this.port.onmessage = (event) => {
            const data = event.data;
            if (!data) {
                return;
            }
            if (data.type === "silence-gate") {
                this.silenceGateEnabled = data.enabled === true;
                // 切替直後は開いて始め、以前の無音状態を持ち越さない。
                this.silenceGateRemainingSamples = Math.ceil(
                    globalThis.sampleRate * SILENCE_GATE_HOLD_SECONDS,
                );
                return;
            }
            if (data.type === "learned-vad-stream") {
                this.learnedVadStreamEnabled = !!data.enabled;
                if (!this.learnedVadStreamEnabled) {
                    this.learnedVadFrameWriteIndex = 0;
                }
                return;
            }
            if (data.type !== "vad-threshold") {
                return;
            }
            this.applyDiagnosticThresholds(data);
        };
    }

    /** 診断用閾値だけを検証・制限する。通常会話の無音化閾値は上書きしない。 */
    applyDiagnosticThresholds(data) {
        if (typeof data.rmsThreshold === "number" && Number.isFinite(data.rmsThreshold)) {
            this.rmsThreshold = Math.max(0.001, Math.min(0.2, data.rmsThreshold));
        }
        if (typeof data.peakThreshold === "number" && Number.isFinite(data.peakThreshold)) {
            this.peakThreshold = Math.max(0.01, Math.min(0.99, data.peakThreshold));
        }
    }

    /** 音声処理スレッドから呼ばれる。無入力時は状態を進めず、trueを返して処理を継続する。 */
    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) {
            return true;
        }

        const channelData = input[0];
        if (!channelData || channelData.length === 0) {
            return true;
        }

        this.copyInputToOutput(input, output, this.shouldSilenceInput(input));

        if (this.learnedVadStreamEnabled) {
            this.pushLearnedVadFrame(channelData);
        }

        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < channelData.length; i += 1) {
            const v = channelData[i];
            sumSquares += v * v;
            const absV = Math.abs(v);
            if (absV > peak) {
                peak = absV;
            }
        }

        // 時間領域波形からRMS/Peakを算出する。
        const rms = Math.sqrt(sumSquares / channelData.length);
        const speechDetected = rms >= this.rmsThreshold || peak >= this.peakThreshold;
        // 発話検知時はhangoverを再セットし、短い無音で状態が揺れないようにする。
        if (speechDetected) {
            this.currentHangover = this.hangoverFrames;
        } else {
            this.currentHangover = Math.max(0, this.currentHangover - 1);
        }

        this.frameCounter += 1;
        if (this.frameCounter >= this.reportEveryFrames) {
            this.frameCounter = 0;
            // UI側へ現在状態を通知する。
            // isSpeech はhangover込みの安定化後判定。
            this.port.postMessage({
                type: "vad",
                isSpeech: this.currentHangover > 0,
                rms: rms,
                peak: peak,
            });
        }
        return true;
    }

    /** 入力ブロック全体を先に確認し、音が戻ったブロックは通知を待たずそのまま通す。 */
    shouldSilenceInput(input) {
        if (!this.silenceGateEnabled) return false;
        // 片側だけに声がある場合も消さない。非有限値は無音と断定せず通す。
        const audible = input.some((channel) =>
            channel.some(
                (value) => !Number.isFinite(value) || Math.abs(value) >= SILENCE_GATE_THRESHOLD,
            ),
        );
        if (audible) {
            this.silenceGateRemainingSamples = Math.ceil(
                globalThis.sampleRate * SILENCE_GATE_HOLD_SECONDS,
            );
            return false;
        }
        const held = this.silenceGateRemainingSamples > 0;
        this.silenceGateRemainingSamples = Math.max(
            0,
            this.silenceGateRemainingSamples - input[0].length,
        );
        return !held;
    }

    /** 出力数と時間軸は保ち、閉鎖時も同じ長さのゼロPCMを渡す。余分な出力には最後の入力を複製する。 */
    copyInputToOutput(input, output, silence) {
        if (output && output.length > 0) {
            for (let ch = 0; ch < output.length; ch += 1) {
                const out = output[ch];
                const src = input[Math.min(ch, input.length - 1)];
                if (!src) {
                    continue;
                }
                if (silence) out.fill(0);
                else out.set(src);
            }
        }
    }

    /** 先頭チャンネルを固定長にまとめて送る。送信用コピーの移譲後も内部バッファーを再利用する。 */
    pushLearnedVadFrame(channelData) {
        let readIndex = 0;
        while (readIndex < channelData.length) {
            const writable = this.learnedVadFrameSize - this.learnedVadFrameWriteIndex;
            const copySize = Math.min(writable, channelData.length - readIndex);
            this.learnedVadFrameBuffer.set(
                channelData.subarray(readIndex, readIndex + copySize),
                this.learnedVadFrameWriteIndex,
            );
            this.learnedVadFrameWriteIndex += copySize;
            readIndex += copySize;

            if (this.learnedVadFrameWriteIndex >= this.learnedVadFrameSize) {
                const pcm = new Float32Array(this.learnedVadFrameBuffer);
                this.port.postMessage(
                    {
                        type: "audio-frame",
                        pcm,
                        sampleRate: globalThis.sampleRate,
                    },
                    [pcm.buffer],
                );
                this.learnedVadFrameWriteIndex = 0;
            }
        }
    }
}

registerProcessor("vad-processor", VadProcessor);
