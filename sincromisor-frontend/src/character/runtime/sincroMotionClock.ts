/** 観測時刻と描画時計の対応だけを保持する。保存ログには含めない。 */
export type SincroMotionObservationTiming = {
    mediaTimeMs: number;
    receivedAtPerformanceMs: number;
};

/** PoseとHandは独立した対応を持つ。Face/Gesture更新では時計を進めない。 */
export class SincroMotionClock {
    private pose?: SincroMotionObservationTiming;
    private hand?: SincroMotionObservationTiming;
    private virtualTimeMs?: number;
    private generation = 0;

    /** 入力切替・停止・非連続シークを消費側へ即座に伝える。 */
    reset(): void {
        this.pose = undefined;
        this.hand = undefined;
        this.virtualTimeMs = undefined;
        this.generation += 1;
    }

    /** ライブの受信境界。逆行は別系列とみなし、両部位の対応を破棄する。 */
    receive(part: "pose" | "hand", timing: SincroMotionObservationTiming): void {
        if (
            !Number.isFinite(timing.mediaTimeMs) ||
            !Number.isFinite(timing.receivedAtPerformanceMs)
        )
            return;
        if (
            this.virtualTimeMs !== undefined ||
            (this[part] && timing.mediaTimeMs < this[part].mediaTimeMs)
        )
            this.reset();
        this[part] = { ...timing };
    }

    /** 再生の仮想時刻。停止中は呼び出されず、壁時計からは進まない。 */
    setReplayTime(mediaTimeMs: number): void {
        if (this.virtualTimeMs === undefined || mediaTimeMs < this.virtualTimeMs) this.reset();
        this.virtualTimeMs = mediaTimeMs;
    }

    /** VRMCharacterManager.updateだけが描画時計を観測時計へ写す。 */
    evaluate(nowMs: number): { series: number; poseTimeMs?: number; handTimeMs?: number } {
        const time = (timing?: SincroMotionObservationTiming) =>
            this.virtualTimeMs ??
            (timing && timing.mediaTimeMs + Math.max(0, nowMs - timing.receivedAtPerformanceMs));
        return {
            series: this.generation,
            poseTimeMs: time(this.pose),
            handTimeMs: time(this.hand),
        };
    }
}
