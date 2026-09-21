/** 端末診断だけの固定語彙。本文・URL・stack・任意contextは送信形式に持たせない。 */
export type DiagnosticEvent =
    | "microphone"
    | "camera"
    | "rtc"
    | "rtc_telop"
    | "rtc_text"
    | "rtc_track"
    | "signaling"
    | "model"
    | "render"
    | "webgl"
    | "unhandled_error"
    | "unhandled_rejection"
    | "vad_worker"
    | "tracker_worker";

const REASONS = new Set([
    "unknown",
    "permission_denied",
    "not_found",
    "not_readable",
    "overconstrained",
    "security",
    "aborted",
    "failed",
    "ready",
    "ended",
    "connected",
    "completed",
    "disconnected",
    "closed",
    "lost",
    "restored",
    "idle",
    "loading",
    "running",
    "fallback",
    "unavailable",
]);
const SESSION_ID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const MAX_PENDING = 64;
const ENDPOINT = "/api/v1/RTCSignalingServer/diagnostics";

type Diagnostic = {
    event: DiagnosticEvent;
    reason: string;
    client_time: string;
    session_id?: string;
    count: number;
};

/** 例外名だけを分類する。messageや名前の未知部分を診断へ流さない。 */
export function diagnosticReason(error: unknown): string {
    const name = error instanceof Error || error instanceof DOMException ? error.name : "";
    switch (name) {
        case "NotAllowedError":
            return "permission_denied";
        case "NotFoundError":
            return "not_found";
        case "NotReadableError":
            return "not_readable";
        case "OverconstrainedError":
            return "overconstrained";
        case "SecurityError":
            return "security";
        case "AbortError":
            return "aborted";
        default:
            return "failed";
    }
}

/** 有限の待ち行列と再試行を所有する。転送失敗をロガーへ再投入しない。 */
export class BrowserDiagnostics {
    private readonly queue: Diagnostic[] = [];
    private batch: Diagnostic[] = [];
    private readonly states = new Map<DiagnosticEvent, string>();
    private timer?: ReturnType<typeof setTimeout>;
    private started = false;
    private sending = false;
    private attempts = 0;
    private dropped = 0;
    private failures = 0;
    private clientId = "";
    private sessionId?: string;

    /** アプリ起動時に一度だけ呼び、タブ限りの識別子と全体例外の入口を作る。 */
    start(): void {
        if (this.started) return;
        this.started = true;
        this.clientId = crypto.randomUUID();
        window.addEventListener("error", () => this.record("unhandled_error", "failed"));
        window.addEventListener("unhandledrejection", () =>
            this.record("unhandled_rejection", "failed"),
        );
        this.schedule();
    }

    /** 確定済みの会話IDだけを以後のイベントへ付ける。既存イベントを書き換えない。 */
    setSession(id?: string): void {
        this.sessionId = id && SESSION_ID.test(id) ? id : undefined;
    }

    /** Workerの毎フレーム通知など、同じ状態の反復を入口で抑止する。 */
    state(event: DiagnosticEvent, reason: string): void {
        if (this.states.get(event) === reason) return;
        this.states.set(event, reason);
        this.record(event, reason);
    }

    /** 診断を追加するだけで、本体の非同期操作や応答を待たせない。 */
    record(event: DiagnosticEvent, reason: string): void {
        const safeReason = REASONS.has(reason) ? reason : "unknown";
        const last = this.queue.at(-1);
        if (
            last?.event === event &&
            last.reason === safeReason &&
            last.session_id === this.sessionId
        ) {
            last.count = Math.min(1000000, last.count + 1);
        } else if (this.queue.length + this.batch.length < MAX_PENDING) {
            this.queue.push({
                event,
                reason: safeReason,
                client_time: new Date().toISOString(),
                session_id: this.sessionId,
                count: 1,
            });
        } else {
            this.dropped = Math.min(1000000, this.dropped + 1);
        }
        this.schedule();
    }

    /** 端末内の未送信・失敗・破棄を確認する。永続保存や成功の保証はしない。 */
    getStats(): { pending: number; failures: number; dropped: number } {
        return {
            pending: this.queue.length + this.batch.length,
            failures: this.failures,
            dropped: this.dropped,
        };
    }

    private schedule(): void {
        if (
            !this.started ||
            this.timer ||
            this.sending ||
            (!this.queue.length && !this.batch.length)
        )
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.flush();
        }, 1000);
    }

    /** 最大8件を3秒で送る。同じバッチは初回と再試行2回までで打ち切る。 */
    private async flush(): Promise<void> {
        this.sending = true;
        if (!this.batch.length) this.batch = this.queue.splice(0, 8);
        try {
            const response = await fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: this.clientId,
                    dropped: this.dropped,
                    failures: this.failures,
                    events: this.batch,
                }),
                signal: AbortSignal.timeout(3000),
                credentials: "same-origin",
            });
            if (response.status !== 204) throw new Error("Diagnostic delivery failed");
            this.batch = [];
            this.attempts = 0;
        } catch {
            this.failures = Math.min(1000000, this.failures + 1);
            this.attempts += 1;
            if (this.attempts >= 3) {
                this.dropped = Math.min(
                    1000000,
                    this.dropped + this.batch.reduce((sum, event) => sum + event.count, 0),
                );
                this.batch = [];
                this.attempts = 0;
            }
        } finally {
            this.sending = false;
            this.schedule();
        }
    }
}
