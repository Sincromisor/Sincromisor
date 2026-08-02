const DISCONNECTED_GRACE_MS = 10_000;

type RtcDisconnectedGraceTimerParams = {
    onGraceExpired: () => void;
};

/**
 * disconnected eventに対する10秒の単一grace timerを所有する。
 *
 * connected/completed復帰はcancelし、連続disconnectedは既存timerを維持する。
 * failed時の即時restartは呼び出し元がcancel後に直接実行するため、このtimerを経由しない。
 */
export class RtcDisconnectedGraceTimer {
    private readonly onGraceExpired: () => void;
    private timerId?: ReturnType<typeof setTimeout>;

    constructor(params: RtcDisconnectedGraceTimerParams) {
        this.onGraceExpired = params.onGraceExpired;
    }

    /** 初回disconnectedでtimerを開始し、既に待機中ならfalseを返す。 */
    schedule(): boolean {
        if (this.timerId !== undefined) {
            return false;
        }
        this.timerId = setTimeout(() => {
            this.timerId = undefined;
            this.onGraceExpired();
        }, DISCONNECTED_GRACE_MS);
        return true;
    }

    /** connected/completed復帰またはowner close時に待機中timerを解除する。 */
    cancel(): void {
        if (this.timerId !== undefined) {
            clearTimeout(this.timerId);
            this.timerId = undefined;
        }
    }
}
