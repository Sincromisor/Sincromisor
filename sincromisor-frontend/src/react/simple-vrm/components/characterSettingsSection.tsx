import type { SincroMediaDeviceSelectionState } from "../../../ts/MediaDevices/SincroMediaDeviceService";
import {
    CharacterDisplayToggles,
    VideoInputDeviceField,
} from "../../settings-fields/SettingsFields";
import { SettingsHelpLabel } from "../../settings-primitives/SettingsPrimitives";
import { sectionSpacingPx, settingsTuning } from "./settingsSectionLayout";
import type { DeviceSettingsProps } from "./settingsSectionTypes";

type CharacterSettingsSectionProps = DeviceSettingsProps & {
    videoInputSelection: SincroMediaDeviceSelectionState;
};

type CharacterSettingsSectionMode = "full" | "camera" | "display";

export function CharacterSettingsSection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    videoInputSelection,
    onApplySettings,
    showSectionTitle = true,
    mode = "full",
}: CharacterSettingsSectionProps & { mode?: CharacterSettingsSectionMode }) {
    const showCameraSelection = mode !== "display";
    const showDisplayOptions = mode !== "camera";
    const sectionLabel =
        mode === "camera"
            ? "視線用カメラ"
            : mode === "display"
              ? "キャラクター表示"
              : "キャラクターと視線";
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showSectionTitle ? (
                <SettingsHelpLabel text="キャラクター設定" />
            ) : (
                <div
                    style={{
                        opacity: 0.8,
                        fontWeight: 700,
                        marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                    }}
                >
                    {sectionLabel}
                </div>
            )}
            {showCameraSelection ? (
                <div style={{ marginBottom: showDisplayOptions ? `${sectionSpacingPx}px` : "0" }}>
                    <VideoInputDeviceField
                        settings={settings}
                        uiState={uiState}
                        uiHints={uiHints}
                        snapshot={mediaDeviceSnapshot}
                        selection={videoInputSelection}
                        onApplySettings={onApplySettings}
                    />
                </div>
            ) : null}
            {showDisplayOptions ? (
                <CharacterDisplayToggles
                    settings={settings}
                    uiState={uiState}
                    uiHints={uiHints}
                    onApplySettings={onApplySettings}
                    renderHint={(label, message) => (
                        <div
                            style={{
                                marginTop: `${settingsTuning.hintMarginTopPx}px`,
                                opacity: 0.7,
                                lineHeight: 1.3,
                            }}
                        >
                            {label}: {message}
                        </div>
                    )}
                />
            ) : null}
        </div>
    );
}
