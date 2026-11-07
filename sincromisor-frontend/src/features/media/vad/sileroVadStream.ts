/** 入力ブロックの境界に依存せず、音声を16kHz・512サンプルへ区切る。モデル状態と推論はWorkerが所有する。 */
export class SileroVadStream {
    private source = new Float32Array(0);
    // 位置は入力サンプルの1/16000単位。整数レートで加算し、ブロック境界の丸め差を避ける。
    private position = 0;
    private frame = new Float32Array(512);
    private used = 0;

    /** 入力の切替・欠落時に呼び、前系列の補間用サンプルと未完成フレームを捨てる。 */
    reset(): void {
        this.source = new Float32Array(0);
        this.position = 0;
        this.frame = new Float32Array(512);
        this.used = 0;
    }

    /** 同じsampleRateの連続PCMを渡す。レート変更前にはresetが必要。不正レートは拒否する。 */
    push(pcm: Float32Array, sampleRate: number): Float32Array[] {
        if (!Number.isFinite(sampleRate) || sampleRate <= 0)
            throw new Error("Invalid PCM sample rate");
        const source = new Float32Array(this.source.length + pcm.length);
        source.set(this.source);
        source.set(pcm, this.source.length);
        const frames: Float32Array[] = [];
        while (this.position < source.length * 16000) {
            const left = Math.floor(this.position / 16000);
            const fraction = (this.position % 16000) / 16000;
            // 補間に次サンプルが必要なら、ゼロ詰めせず次のブロックを待つ。
            if (fraction > 1e-8 && left + 1 >= source.length) break;
            const first = source[left];
            this.frame[this.used++] = first + ((source[left + 1] ?? first) - first) * fraction;
            this.position += sampleRate;
            if (this.used === 512) {
                frames.push(this.frame);
                this.frame = new Float32Array(512);
                this.used = 0;
            }
        }
        const consumed = Math.min(Math.floor(this.position / 16000), source.length);
        this.source = source.slice(consumed);
        this.position -= consumed * 16000;
        return frames;
    }
}
