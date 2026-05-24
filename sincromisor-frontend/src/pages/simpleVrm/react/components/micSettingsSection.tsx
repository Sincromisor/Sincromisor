import {
    AudioInputDeviceField,
    AudioProcessingToggles,
} from "../../../../features/settings/react/fields/settingsFields";
import {
    SettingsButton,
    SettingsHelpLabel,
    SettingsHint,
} from "../../../../features/settings/react/primitives/settingsPrimitives";
import { useSettingsDeviceRefresh } from "../../../../features/settings/react/sections/settingsDeviceRefresh";
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
        <div className="settingsPrimitiveSectionBlock">
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
            <div className={showProcessingOptions ? "settingsPrimitiveSectionBlock" : undefined}>
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
        <div className="settingsPrimitiveInlineActions">
            {showSectionTitle ? (
                <SettingsHelpLabel text="マイク設定" />
            ) : (
                <span className="settingsPrimitiveSectionLead settingsPrimitiveSectionLead--inline">
                    マイク入力
                </span>
            )}
            <SettingsButton type="button" onClick={onRefreshDevices} disabled={isRefreshing}>
                {isRefreshing ? "更新中..." : "再読み込み"}
            </SettingsButton>
        </div>
    );
}

function MicRefreshMessage({ text }: { text: string }) {
    return <SettingsHint className="settingsPrimitiveHint--topGap">{text}</SettingsHint>;
}
