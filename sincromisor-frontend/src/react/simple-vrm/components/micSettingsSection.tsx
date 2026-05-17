import { useState } from "react";
import {
    AudioInputDeviceField,
    AudioProcessingToggles,
} from "../../settings-fields/SettingsFields";
import { SettingsButton, SettingsHelpLabel } from "../../settings-primitives/SettingsPrimitives";
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
    const [refreshMessage, setRefreshMessage] = useState<string>("");
    const showDeviceSelection = mode !== "processing";
    const showProcessingOptions = mode !== "device";

    const handleRefreshDevices = () => {
        setRefreshMessage("");
        void onRefreshDevices().then((nextSnapshot) => {
            if (nextSnapshot.refreshError) {
                setRefreshMessage(
                    `デバイス一覧の再取得に失敗しました: ${nextSnapshot.refreshError}`,
                );
                return;
            }
            setRefreshMessage("デバイス一覧を更新しました。");
        });
    };

    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showDeviceSelection ? (
                <>
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
                        <SettingsButton
                            type="button"
                            onClick={handleRefreshDevices}
                            disabled={mediaDeviceSnapshot.isRefreshing}
                        >
                            {mediaDeviceSnapshot.isRefreshing ? "更新中..." : "再読み込み"}
                        </SettingsButton>
                    </div>
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
            ) : null}
            {showProcessingOptions ? (
                <AudioProcessingToggles
                    settings={settings}
                    uiState={uiState}
                    onApplySettings={onApplySettings}
                />
            ) : null}
            {refreshMessage ? (
                <div
                    style={{
                        marginTop: `${settingsTuning.hintMarginTopPx}px`,
                        opacity: 0.7,
                        lineHeight: 1.3,
                    }}
                >
                    {refreshMessage}
                </div>
            ) : null}
        </div>
    );
}
