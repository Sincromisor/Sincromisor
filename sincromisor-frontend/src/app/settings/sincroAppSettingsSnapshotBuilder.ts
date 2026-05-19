import { getLookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";

// Dialog 設定値 + Looking Glass runtime config を合成して、
// UI/API 共通の settings snapshot を作る helper。
export function buildSincroAppSettingsSnapshot(
    dialogManager: SincroAppDialogFacade,
): SincroAppSettingsSnapshot {
    const lg = getLookingGlassRuntimeConfig();
    return {
        titleText: dialogManager.titleText(),
        talkMode: dialogManager.talkMode(),
        audioInputDeviceId: dialogManager.audioInputDeviceId(),
        videoInputDeviceId: dialogManager.videoInputDeviceId(),
        enableCharacter: dialogManager.enableCharacter(),
        enableTalk: dialogManager.enableTalk(),
        enableCharacterGaze: dialogManager.enableCharacterGaze(),
        enableSincroPoseTracking: dialogManager.enableSincroPoseTracking(),
        forceSincroPoseTracking: dialogManager.forceSincroPoseTracking(),
        enableAutoMute: dialogManager.enableAutoMute(),
        enableNoiseSuppression: dialogManager.enableNoiseSuppression(),
        enableEchoCancellation: dialogManager.enableEchoCancellation(),
        enableAutoGainControl: dialogManager.enableAutoGainControl(),
        enableVadGate: dialogManager.enableVadGate(),
        enableVenueNoiseMode: dialogManager.enableVenueNoiseMode(),
        enableInspector: dialogManager.enableInspector(),
        enableVR: dialogManager.enableVR(),
        characterMotionScale: dialogManager.characterMotionScale(),
        sincroPoseRetargetScale: dialogManager.sincroPoseRetargetScale(),
        characterEyeTrackingScale: dialogManager.characterEyeTrackingScale(),
        lgTileHeight: lg.tileHeight,
        lgNumViews: lg.numViews,
        lgTargetY: lg.targetY,
        lgTargetZ: lg.targetZ,
        lgTargetDiam: lg.targetDiam,
        lgDepthiness: lg.depthiness,
        lgFovyDeg: lg.fovyDeg,
    };
}
