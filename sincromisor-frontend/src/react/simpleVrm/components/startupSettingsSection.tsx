import type { ReactNode } from "react";
import { StartupBehaviorFields } from "../../settingsFields/settingsFields";
import { SettingsHelpLabel } from "../../settingsPrimitives/settingsPrimitives";
import type {
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../panelTypes";
import { compactGapPx, sectionSpacingPx, settingsTuning } from "./settingsSectionLayout";
import type { SettingsApplyProps } from "./settingsSectionTypes";

type StartupSettingsSectionProps = SettingsApplyProps & {
    isRunning: boolean;
    startupStatus: SincroAppStartupSettingsStatus;
    startupCapabilities: SincroAppStartupSettingsCapabilities;
    showSectionTitle?: boolean;
};

export function StartupSettingsSection({
    settings,
    uiState,
    onApplySettings,
    isRunning,
    startupStatus,
    startupCapabilities,
    showSectionTitle = true,
}: StartupSettingsSectionProps) {
    // 表示対象がない場合は、空カードや「項目なし」文言を出さずに section ごと隠す。
    if (!startupCapabilities.enableVR) {
        return null;
    }
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {renderStartupSectionLabel(showSectionTitle)}
            <StartupBehaviorFields
                settings={settings}
                uiState={uiState}
                onApplySettings={onApplySettings}
                isRunning={isRunning}
                startupStatus={startupStatus}
                startupCapabilities={startupCapabilities}
                useFieldStack={false}
                introText={{
                    running:
                        "開始前に決まる動きです。いま変更した内容を反映したい時は、いったん停止してからもう一度始めてください。",
                    stopped:
                        "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。",
                }}
                renderHint={(message, tone) => (
                    <div
                        style={{
                            opacity: tone ? 1 : 0.6,
                            marginBottom: `${compactGapPx}px`,
                            color:
                                tone === "warning"
                                    ? "#ffd38a"
                                    : tone === "info"
                                      ? "#b8e0ff"
                                      : undefined,
                            lineHeight: 1.3,
                        }}
                    >
                        {message}
                    </div>
                )}
            />
        </div>
    );
}

function renderStartupSectionLabel(showSectionTitle: boolean): ReactNode {
    if (showSectionTitle) {
        return <SettingsHelpLabel text="開始時の動作" />;
    }
    return (
        <div
            style={{
                opacity: 0.8,
                fontWeight: 700,
                marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
            }}
        >
            ページ開始時の動作
        </div>
    );
}
