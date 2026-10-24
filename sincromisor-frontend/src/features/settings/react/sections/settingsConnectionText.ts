import type {
    SincroAppLifecycleState,
    SincroAppStartupSettingsStatus,
} from "../../../../app/controller";

/** アプリが導出した接続・音声取得の状態を、通常表示の操作語へ変換する。 */
export function connectionStatusLabel(value: string): string {
    switch (value) {
        case "connected":
            return "接続済み";
        case "starting":
            return "開始準備中";
        case "connecting":
            return "接続中";
        case "degraded":
            return "要確認";
        case "input_failed":
            return "マイクを開始できません";
        case "stopping":
            return "停止中";
        case "stopped":
        case "idle":
            return "未接続";
        default:
            return value;
    }
}

export function createStartupOptionHint(status: SincroAppStartupSettingsStatus): string {
    if (status.changedKeys.length === 0) {
        return "";
    }
    return `開始前だけ効く項目に変更があります: ${status.changedKeys.join(", ")}`;
}

/** 接続が生きている間だけ、体験変更時の操作を常設の接続欄へ案内する。 */
export function createTalkModeReconnectHint(lifecycle: SincroAppLifecycleState): string {
    return lifecycle === "running" || lifecycle === "starting"
        ? "体験を変える場合は、接続を停止して再開してください。"
        : "";
}
