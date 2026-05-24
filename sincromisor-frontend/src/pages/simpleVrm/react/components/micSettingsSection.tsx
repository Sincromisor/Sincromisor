import {
    AudioInputDeviceField,
    AudioProcessingToggles,
} from "../../../../features/settings/react/fields/settingsFields";
import {
    SettingsButton,
    SettingsHelpLabel,
} from "../../../../features/settings/react/primitives/settingsPrimitives";
import { useSettingsDeviceRefresh } from "../../../../features/settings/react/sections/settingsDeviceRefresh";
import { compactGapPx, sectionSpacingPx, settingsTuning } from "./settingsSectionLayout";
import type { DeviceSettingsProps } from "./settingsSectionTypes";

type MicSettingsSectionMode = "full" | "device" | "processing";

export function MicSettingsSection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    audioInputSelection,
    onApplySettings,
    onRefreshDevices,
    showSectionTitle = true,
    mode = "full",
}: DeviceSettingsProps & { mode?: MicSettingsSectionMode }) {
    const { refreshMessage, handleRefreshDevices } = useSettingsDeviceRefresh(onRefreshDevices);
    const showDeviceSelection = mode !== "processing";
    const showProcessingOptions = mode !== "device";

    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showDeviceSelection ? (
                <MicDeviceSelection
                    settings={settings}
                    uiState={uiState}
                    uiHints={uiHints}
                    mediaDeviceSnapshot={mediaDeviceSnapshot}
                    audioInputSelection={audioInputSelection}
                    onApplySettings={onApplySettings}
                    onRefreshDevices={handleRefreshDevices}
                    showSectionTitle={showSectionTitle}
                    showProcessingOptions={showProcessingOptions}
                />
            ) : null}
            {showProcessingOptions ? (
                <AudioProcessingToggles
                    settings={settings}
                    uiState={uiState}
                    onApplySettings={onApplySettings}
                />
            ) : null}
            {refreshMessage ? <MicRefreshMessage text={refreshMessage} /> : null}
        </div>
    );
}

type MicDeviceSelectionProps = Omit<DeviceSettingsProps, "onRefreshDevices"> & {
    onRefreshDevices: () => void;
    showSectionTitle: boolean;
    showProcessingOptions: boolean;
};

function MicDeviceSelection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    audioInputSelection,
    onApplySettings,
    onRefreshDevices,
    showSectionTitle,
    showProcessingOptions,
}: MicDeviceSelectionProps) {
    return (
        <>
            <MicDeviceSelectionHeader
                isRefreshing={mediaDeviceSnapshot.isRefreshing}
                onRefreshDevices={onRefreshDevices}
                showSectionTitle={showSectionTitle}
            />
            <div
                style={{
                    marginBottom: showProcessingOptions ? `${sectionSpacingPx}px` : "0",
                }}
            >
                <AudioInputDeviceField
                    settings={settings}
                    uiState={uiState}
                    uiHints={uiHints}
                    snapshot={mediaDeviceSnapshot}
                    selection={audioInputSelection}
                    onApplySettings={onApplySettings}
                />
            </div>
        </>
    );
}

function MicDeviceSelectionHeader({
    isRefreshing,
    onRefreshDevices,
    showSectionTitle,
}: {
    isRefreshing: boolean;
    onRefreshDevices: () => void;
    showSectionTitle: boolean;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: `${compactGapPx}px`,
                marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
            }}
        >
            {showSectionTitle ? (
                <SettingsHelpLabel text="マイク設定" />
            ) : (
                <span style={{ opacity: 0.8, fontWeight: 700 }}>マイク入力</span>
            )}
            <SettingsButton type="button" onClick={onRefreshDevices} disabled={isRefreshing}>
                {isRefreshing ? "更新中..." : "再読み込み"}
            </SettingsButton>
        </div>
    );
}

function MicRefreshMessage({ text }: { text: string }) {
    return (
        <div
            style={{
                marginTop: `${settingsTuning.hintMarginTopPx}px`,
                opacity: 0.7,
                lineHeight: 1.3,
            }}
        >
            {text}
        </div>
    );
}
