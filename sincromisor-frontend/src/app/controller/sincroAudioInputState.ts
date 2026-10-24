/** 初回の音声取得結果。機器の実使用とRTC接続・体験全体の状態から独立して保持する。 */
export type SincroAudioInputState =
    | { status: "idle" | "acquiring" | "ready" }
    | { status: "failed"; reason: SincroAudioInputFailure };

/** ブラウザーから確定できる失敗原因だけを通常表示へ渡す。例外本文は診断側に残す。 */
export type SincroAudioInputFailure = "permission" | "not-found" | "other";

/** 権限拒否と機器不在を区別し、それ以外の原因を推測しない。 */
export function classifyAudioInputFailure(error: unknown): SincroAudioInputFailure {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "permission";
    if (name === "NotFoundError" || name === "DevicesNotFoundError") return "not-found";
    return "other";
}

/** 権限変更など利用者だけが行える復旧操作を、該当する失敗時だけ短く案内する。 */
export function audioInputFailureMessage(reason: SincroAudioInputFailure): string {
    switch (reason) {
        case "permission":
            return "マイクの使用が許可されていません。ブラウザーで許可してください。";
        case "not-found":
            return "マイクが見つかりません。接続を確認してください。";
        case "other":
            return "マイクを開始できませんでした。";
    }
}
