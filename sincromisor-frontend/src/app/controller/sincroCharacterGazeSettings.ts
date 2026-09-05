import type { DialogManager } from "../../features/dialog/model/dialogManager";
import type { DialogBackedSincroAppSettings } from "../settings/sincroAppSettingsDefaults";

/** 視線設定の差分判定で使用する項目。値の型はダイアログ設定と共有する。 */
export type DialogGazeSettingsSnapshot = Pick<
    DialogBackedSincroAppSettings,
    | "enableCharacterGaze"
    | "enableSincroPoseTracking"
    | "forceSincroPoseTracking"
    | "videoInputDeviceId"
    | "talkMode"
>;

export type DialogGazeSettingsChanges = {
    videoDeviceChanged: boolean;
    gazeEnabledChanged: boolean;
    talkModeChanged: boolean;
    poseTrackingChanged: boolean;
    forcePoseTrackingChanged: boolean;
};

/** 通知時点の設定を複製し、追跡処理へ渡す前の差分判定に使う。 */
export function readDialogGazeSettingsSnapshot(
    dialogManager: DialogManager,
): DialogGazeSettingsSnapshot {
    return dialogManager.getSettings();
}

export function compareDialogGazeSettings(
    prev: DialogGazeSettingsSnapshot | undefined,
    next: DialogGazeSettingsSnapshot,
    forceAll: boolean,
): DialogGazeSettingsChanges {
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
    changes: DialogGazeSettingsChanges,
    reset: () => void,
): void {
    if (changes.gazeEnabledChanged || changes.videoDeviceChanged || changes.talkModeChanged) {
        reset();
    }
}
