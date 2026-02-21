class VadProcessor extends AudioWorkletProcessor {
  // 音声フレームごとの簡易VADを行うプロセッサ。
  // 入力波形をそのまま出力へパススルーしつつ、RMS/Peakベースで発話有無を通知する。
  constructor() {
    super();
    // RMS閾値: 平均的なエネルギー量がこの値以上なら発話候補とみなす。
    this.rmsThreshold = 0.015;
    // Peak閾値: 瞬間的な振幅がこの値以上なら発話候補とみなす。
    this.peakThreshold = 0.06;
    // hangover: 発話検知後すぐにSilenceへ戻さないための保持フレーム数。
    this.hangoverFrames = 12;
    this.currentHangover = 0;
    // 毎フレーム通知するとUI更新負荷が高いため、数フレームごとに集約して通知する。
    this.reportEveryFrames = 4;
    this.frameCounter = 0;
    // 学習ベースVAD向けにPCMフレームを送るかどうか。
    // ブラウザ実装差で制御メッセージが初回に届かないケースを避けるため、既定で有効化しておく。
    // 実際の推論ON/OFFはメインスレッド側(WorkerClient.enabled)でもガードしている。
    this.learnedVadStreamEnabled = true;
    this.learnedVadFrameSize = 1536; // 48kHzで約32ms。送信頻度を抑えてCPU負荷を下げる。
    this.learnedVadFrameBuffer = new Float32Array(this.learnedVadFrameSize);
    this.learnedVadFrameWriteIndex = 0;

    // メインスレッドからVAD閾値を更新できるようにする。
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) {
        return;
      }
      if (data.type === "learned-vad-stream") {
        this.learnedVadStreamEnabled = !!data.enabled;
        if (!this.learnedVadStreamEnabled) {
          this.learnedVadFrameWriteIndex = 0;
        }
        return;
      }
      if (!data || data.type !== "vad-threshold") {
        return;
      }
      if (typeof data.rmsThreshold === "number" && Number.isFinite(data.rmsThreshold)) {
        this.rmsThreshold = Math.max(0.001, Math.min(0.2, data.rmsThreshold));
      }
      if (typeof data.peakThreshold === "number" && Number.isFinite(data.peakThreshold)) {
        this.peakThreshold = Math.max(0.01, Math.min(0.99, data.peakThreshold));
      }
    };
  }

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

    // 処理後音声をそのまま次段へ渡す（VAD表示のみで音声内容は変更しない）。
    if (output && output.length > 0) {
      for (let ch = 0; ch < output.length; ch += 1) {
        const out = output[ch];
        const src = input[Math.min(ch, input.length - 1)];
        if (!src) {
          continue;
        }
        out.set(src);
      }
    }

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
