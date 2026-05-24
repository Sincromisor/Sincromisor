import type { SincroAppStartupSettingsStatus } from "../../../../app/controller";

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
