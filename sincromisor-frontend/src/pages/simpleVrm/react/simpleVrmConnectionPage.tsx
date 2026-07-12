import {
    connectionStatusLabel,
    createStartupOptionHint,
} from "../../../features/settings/react/sections/settingsConnectionText";
import { settingsPageCopy } from "../../../features/settings/react/shell/settingsPageCopy";
import { DiagnosticsStatusCards } from "./components/diagnosticsStatusCards";
import { SettingsCategorySection, StartupSettingsSection } from "./components/settingsSections";
import { panelStyles } from "./panelStyles";
import type { SimpleVrmControlPanelPageProps } from "./simpleVrmControlPanelTypes";

export function ConnectionSettingsPage({ panelState }: SimpleVrmControlPanelPageProps) {
    const hasStartupOptions = panelState.startupSettingsCapabilities.enableVR;

    return (
        <>
            {hasStartupOptions ? <StartupSettingsCategory panelState={panelState} /> : null}
            <ConnectionStatusCategory panelState={panelState} />
        </>
    );
}

function StartupSettingsCategory({ panelState }: SimpleVrmControlPanelPageProps) {
    return (
        <SettingsCategorySection title={settingsPageCopy.connection.startupSectionTitle}>
            <StartupSettingsSection
                settings={panelState.settings}
                uiState={panelState.settingsUiState}
                onApplySettings={panelState.applySettings}
                isRunning={panelState.lifecycleState === "running"}
                startupStatus={panelState.startupSettingsStatus}
                startupCapabilities={panelState.startupSettingsCapabilities}
                showSectionTitle={false}
            />
        </SettingsCategorySection>
    );
}

function ConnectionStatusCategory({ panelState }: SimpleVrmControlPanelPageProps) {
    const detail =
        panelState.connectionState.detail ??
        (panelState.hasActiveController ? "接続済みです。" : "");
    const startupOptionHint = createStartupOptionHint(panelState.startupSettingsStatus);

    return (
        <SettingsCategorySection title={settingsPageCopy.connection.statusSectionTitle}>
            <div style={{ display: "grid", gap: "14px" }}>
                <ConnectionStatusCard
                    value={panelState.connectionState.value}
                    detail={detail}
                    startupOptionHint={startupOptionHint}
                />
                <DiagnosticsStatusCards
                    vadState={panelState.vadState}
                    gaze={panelState.gaze}
                    rtcState={panelState.rtcState}
                    learnedVad={panelState.learnedVad}
                    lookingGlass={panelState.lookingGlass}
                    cameraGuide={panelState.cameraGuide}
                />
                <ConnectionActionButtons panelState={panelState} />
            </div>
        </SettingsCategorySection>
    );
}

type ConnectionStatusCardProps = {
    value: string;
    detail: string;
    startupOptionHint: string;
};

function ConnectionStatusCard({ value, detail, startupOptionHint }: ConnectionStatusCardProps) {
    return (
        <div
            style={{
                display: "grid",
                gap: "6px",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(157, 176, 204, 0.14)",
                background: "rgba(255,255,255,0.03)",
            }}
        >
            <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{connectionStatusLabel(value)}</div>
            {detail ? <div style={{ opacity: 0.78, lineHeight: 1.45 }}>{detail}</div> : null}
            {startupOptionHint ? (
                <div style={{ opacity: 0.72, lineHeight: 1.45 }}>{startupOptionHint}</div>
            ) : null}
        </div>
    );
}

function ConnectionActionButtons({ panelState }: SimpleVrmControlPanelPageProps) {
    return (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
                type="button"
                onClick={panelState.startAction}
                disabled={!panelState.hasActiveController}
                style={panelStyles.button}
            >
                会話を開始
            </button>
            <button
                type="button"
                onClick={panelState.stopAction}
                disabled={!panelState.hasActiveController}
                style={panelStyles.button}
            >
                接続を停止
            </button>
        </div>
    );
}
