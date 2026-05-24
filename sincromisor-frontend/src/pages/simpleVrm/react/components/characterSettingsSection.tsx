import type { ReactNode } from "react";
import type { SincroMediaDeviceSelectionState } from "../../../../features/media/devices/sincroMediaDeviceService";
import {
    CharacterDisplayToggles,
    VideoInputDeviceField,
} from "../../../../features/settings/react/fields/settingsFields";
import {
    SettingsHelpLabel,
    SettingsHint,
} from "../../../../features/settings/react/primitives/settingsPrimitives";
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
        <div className="settingsPrimitiveSectionBlock">
            {renderCharacterSectionLabel(showSectionTitle, sectionLabel)}
            {showCameraSelection
                ? renderCharacterCameraField({
                      settings,
                      uiState,
                      uiHints,
                      mediaDeviceSnapshot,
                      videoInputSelection,
                      onApplySettings,
                      showDisplayOptions,
                  })
                : null}
            {showDisplayOptions ? (
                <CharacterDisplayToggles
                    settings={settings}
                    uiState={uiState}
                    uiHints={uiHints}
                    onApplySettings={onApplySettings}
                    renderHint={(label, message) => (
                        <SettingsHint className="settingsPrimitiveHint--topGap">
                            {label}: {message}
                        </SettingsHint>
                    )}
                />
            ) : null}
        </div>
    );
}

function renderCharacterSectionLabel(showSectionTitle: boolean, sectionLabel: string): ReactNode {
    if (showSectionTitle) {
        return <SettingsHelpLabel text="キャラクター設定" />;
    }
    return <div className="settingsPrimitiveSectionLead">{sectionLabel}</div>;
}

function renderCharacterCameraField(props: CharacterCameraFieldProps): ReactNode {
    return (
        <div className={props.showDisplayOptions ? "settingsPrimitiveSectionBlock" : undefined}>
            <VideoInputDeviceField
                settings={props.settings}
                uiState={props.uiState}
                uiHints={props.uiHints}
                snapshot={props.mediaDeviceSnapshot}
                selection={props.videoInputSelection}
                onApplySettings={props.onApplySettings}
            />
        </div>
    );
}

type CharacterCameraFieldProps = {
    settings: CharacterSettingsSectionProps["settings"];
    uiState: CharacterSettingsSectionProps["uiState"];
    uiHints: CharacterSettingsSectionProps["uiHints"];
    mediaDeviceSnapshot: CharacterSettingsSectionProps["mediaDeviceSnapshot"];
    videoInputSelection: SincroMediaDeviceSelectionState;
    onApplySettings: CharacterSettingsSectionProps["onApplySettings"];
    showDisplayOptions: boolean;
};
