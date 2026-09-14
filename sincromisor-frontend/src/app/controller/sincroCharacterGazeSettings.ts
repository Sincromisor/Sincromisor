import type { SincroAppSettings } from "../settings/sincroAppSettingsDefaults";
import type { SincroAppSettingsModel } from "../settings/sincroAppSettingsModel";

/** 視線設定の差分判定で使用する項目。値の型は通常設定と共有する。 */
export type GazeSettingsSnapshot = Pick<
    SincroAppSettings,
    | "enableCharacterGaze"
    | "enableSincroPoseTracking"
    | "forceSincroPoseTracking"
    | "videoInputDeviceId"
    | "talkMode"
>;

/** 追跡の再開始と状態初期化を判断する設定差分。 */
export type GazeSettingsChanges = {
    videoDeviceChanged: boolean;
    gazeEnabledChanged: boolean;
    talkModeChanged: boolean;
    poseTrackingChanged: boolean;
    forcePoseTrackingChanged: boolean;
};

/** 通知時点の設定を複製し、追跡処理へ渡す前の差分判定に使う。 */
export function readGazeSettingsSnapshot(
    settingsModel: SincroAppSettingsModel,
): GazeSettingsSnapshot {
    return settingsModel.getSettings();
}

/** 初回は全項目、それ以降は値が変わった項目だけを反映対象とする。 */
export function compareGazeSettings(
    prev: GazeSettingsSnapshot | undefined,
    next: GazeSettingsSnapshot,
    forceAll: boolean,
): GazeSettingsChanges {
    return {
        videoDeviceChanged:
            forceAll || prev === undefined || prev.videoInputDeviceId !== next.videoInputDeviceId,
        gazeEnabledChanged:
            forceAll || prev === undefined || prev.enableCharacterGaze !== next.enableCharacterGaze,
        talkModeChanged: forceAll || prev === undefined || prev.talkMode !== next.talkMode,
        poseTrackingChanged:
            forceAll ||
            prev === undefined ||
            prev.enableSincroPoseTracking !== next.enableSincroPoseTracking,
        forcePoseTrackingChanged:
            forceAll ||
            prev === undefined ||
            prev.forceSincroPoseTracking !== next.forceSincroPoseTracking,
    };
}

/**
 * camera quality を含む motion state を破棄すべき settings lifecycle だけを reset owner へ渡す。
 *
 * talk mode 離脱と camera device / gaze enable 切替は、直前の camera guide を次の tracking session へ
 * 持ち越せない境界である。Pose tuning だけの変更は camera source を切らないため対象外とする。
 */
export function resetSincroMotionForGazeSettingsChanges(
    changes: GazeSettingsChanges,
    reset: () => void,
): void {
    if (changes.gazeEnabledChanged || changes.videoDeviceChanged || changes.talkModeChanged) {
        reset();
    }
}
