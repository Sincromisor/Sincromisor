/** 発話確率と継続回数の調整値。確率閾値はSilero公式既定0.5/0.35を基準とする。 */
export type SileroVadSpeechParams = {
    onThreshold?: number;
    offThreshold?: number;
    hangoverMs?: number;
    minInferIntervalMs?: number;
    onConsecutiveFrames?: number;
    offConsecutiveFrames?: number;
};

/** 確率を発話状態へ変換する。無音への復帰には連続判定と保持時間の両方を要求する。 */
export class SileroVadSpeechState {
    private modeOnThreshold = 0.5;
    private modeOffThreshold = 0.35;
    private hangoverMs = 180;
    private onConsecutiveFrames = 2;
    private offConsecutiveFrames = 2;
    private isSpeech = false;
    private lastSpeechAtMs = 0;
    private onConsecutiveCount = 0;
    private offConsecutiveCount = 0;

    /** 入力系列の切替で、前系列の発話と連続回数を破棄する。 */
    reset(): void {
        this.onConsecutiveCount = 0;
        this.offConsecutiveCount = 0;
        this.isSpeech = false;
    }

    /** 有限の指定値だけ反映し、終了閾値を開始より低く制限する。 */
    setParams(params: SileroVadSpeechParams): void {
        if (typeof params.onThreshold === "number" && Number.isFinite(params.onThreshold)) {
            this.modeOnThreshold = Math.max(0.01, Math.min(0.99, params.onThreshold));
        }
        if (typeof params.offThreshold === "number" && Number.isFinite(params.offThreshold)) {
            this.modeOffThreshold = Math.max(
                0.01,
                Math.min(this.modeOnThreshold * 0.95, params.offThreshold),
            );
        }
        if (typeof params.hangoverMs === "number" && Number.isFinite(params.hangoverMs)) {
            this.hangoverMs = Math.max(0, Math.min(1200, Math.round(params.hangoverMs)));
        }
        if (
            typeof params.onConsecutiveFrames === "number" &&
            Number.isFinite(params.onConsecutiveFrames)
        ) {
            this.onConsecutiveFrames = Math.max(
                1,
                Math.min(10, Math.round(params.onConsecutiveFrames)),
            );
        }
        if (
            typeof params.offConsecutiveFrames === "number" &&
            Number.isFinite(params.offConsecutiveFrames)
        ) {
            this.offConsecutiveFrames = Math.max(
                1,
                Math.min(10, Math.round(params.offConsecutiveFrames)),
            );
        }
    }

    /** 1フレームの発話確率で状態を進める。保持時間は処理時刻のミリ秒で測る。 */
    update(probability: number): boolean {
        const now = Date.now();
        if (probability >= this.modeOnThreshold) {
            this.onConsecutiveCount += 1;
            this.offConsecutiveCount = 0;
            if (this.onConsecutiveCount >= this.onConsecutiveFrames) {
                this.isSpeech = true;
                this.lastSpeechAtMs = now;
                return true;
            }
            return this.isSpeech;
        }
        this.onConsecutiveCount = 0;
        this.offConsecutiveCount =
            probability < this.modeOffThreshold ? this.offConsecutiveCount + 1 : 0;
        if (
            this.offConsecutiveCount >= this.offConsecutiveFrames &&
            probability < this.modeOffThreshold &&
            now - this.lastSpeechAtMs > this.hangoverMs
        ) {
            this.isSpeech = false;
            this.offConsecutiveCount = 0;
        }
        return this.isSpeech;
    }
}
