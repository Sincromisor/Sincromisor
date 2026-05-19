import type { DialogManager } from "../ui/dialogManager";

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
