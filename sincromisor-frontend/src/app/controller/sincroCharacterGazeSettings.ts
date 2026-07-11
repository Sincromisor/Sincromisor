import type { DialogManager } from "../../features/dialog/model/dialogManager";

export type DialogGazeSettingsSnapshot = {
    enableCharacterGaze: boolean;
    enableSincroPoseTracking: boolean;
    forceSincroPoseTracking: boolean;
    videoInputDeviceId: string | undefined;
    talkMode: string;
};

export type DialogGazeSettingsChanges = {
    videoDeviceChanged: boolean;
    gazeEnabledChanged: boolean;
    talkModeChanged: boolean;
    poseTrackingChanged: boolean;
    forcePoseTrackingChanged: boolean;
};

export function readDialogGazeSettingsSnapshot(
    dialogManager: DialogManager,
): DialogGazeSettingsSnapshot {
    return {
        enableCharacterGaze: dialogManager.enableCharacterGaze(),
        enableSincroPoseTracking: dialogManager.enableSincroPoseTracking(),
        forceSincroPoseTracking: dialogManager.forceSincroPoseTracking(),
        videoInputDeviceId: dialogManager.videoInputDeviceId(),
        talkMode: dialogManager.talkMode(),
    };
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
