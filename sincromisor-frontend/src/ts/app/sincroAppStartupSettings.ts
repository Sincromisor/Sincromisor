import type {
    SincroAppLifecycleState,
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsStatus,
} from "../../app/controller/sincroAppTypes";

export type SincroAppStartupAppliedSettings = Pick<
    SincroAppSettingsSnapshot,
    "enableTalk" | "enableInspector" | "enableVR"
>;

// 起動時に適用された startup 設定との差分から、「再起動推奨/次回起動反映」を判定する pure helper。
export function buildStartupSettingsStatus(params: {
    lifecycleState: SincroAppLifecycleState;
    current: SincroAppSettingsSnapshot;
    applied: SincroAppStartupAppliedSettings | undefined;
}): SincroAppStartupSettingsStatus {
    if (params.applied === undefined) {
        return {
            requiresRestart: false,
            willApplyOnNextStart: false,
            changedKeys: [],
        };
    }

    const changedKeys: SincroAppStartupSettingsStatus["changedKeys"] = [];
    if (params.current.enableTalk !== params.applied.enableTalk) {
        changedKeys.push("enableTalk");
    }
    if (params.current.enableInspector !== params.applied.enableInspector) {
        changedKeys.push("enableInspector");
    }
    if (params.current.enableVR !== params.applied.enableVR) {
        changedKeys.push("enableVR");
    }
    if (changedKeys.length === 0) {
        return {
            requiresRestart: false,
            willApplyOnNextStart: false,
            changedKeys,
        };
    }
    if (params.lifecycleState === "running" || params.lifecycleState === "starting") {
        return {
            requiresRestart: true,
            willApplyOnNextStart: false,
            changedKeys,
        };
    }
    return {
        requiresRestart: false,
        willApplyOnNextStart: true,
        changedKeys,
    };
}
