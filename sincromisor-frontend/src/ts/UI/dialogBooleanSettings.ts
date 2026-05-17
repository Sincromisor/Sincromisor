export type BooleanDialogSettingKey =
    | "enableCharacter"
    | "enableTalk"
    | "enableCharacterGaze"
    | "enableSincroPoseTracking"
    | "forceSincroPoseTracking"
    | "enableAutoMute"
    | "enableNoiseSuppression"
    | "enableEchoCancellation"
    | "enableAutoGainControl"
    | "enableVadGate"
    | "enableVenueNoiseMode"
    | "enableInspector"
    | "enableVR";

const BOOLEAN_DIALOG_SETTING_KEYS: Record<string, BooleanDialogSettingKey | undefined> = {
    enableCharacter: "enableCharacter",
    enableTalk: "enableTalk",
    enableCharacterGaze: "enableCharacterGaze",
    enableSincroPoseTracking: "enableSincroPoseTracking",
    forceSincroPoseTracking: "forceSincroPoseTracking",
    enableAutoMute: "enableAutoMute",
    enableNoiseSuppression: "enableNoiseSuppression",
    enableEchoCancellation: "enableEchoCancellation",
    enableAutoGainControl: "enableAutoGainControl",
    enableVadGate: "enableVadGate",
    enableVenueNoiseMode: "enableVenueNoiseMode",
    enableInspector: "enableInspector",
    enableVR: "enableVR",
};

export function mapBooleanDialogSettingId(id: string): BooleanDialogSettingKey | undefined {
    return BOOLEAN_DIALOG_SETTING_KEYS[id];
}
