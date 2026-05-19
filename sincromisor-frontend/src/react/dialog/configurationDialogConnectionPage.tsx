import { settingsPageCopy } from "../settingsShell/settingsPageCopy";
import {
    DialogSettingsCategory,
    DialogStartupSettingsSection,
} from "./components/dialogSettingsFormSections";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

type ConfigurationDialogSettingsState = ReturnType<typeof useConfigurationDialogSettingsState>;

type ConfigurationDialogConnectionPageProps = {
    state: ConfigurationDialogSettingsState;
};

export function ConfigurationDialogConnectionPage({
    state,
}: ConfigurationDialogConnectionPageProps) {
    const hasStartupOptions = state.startupSettingsCapabilities.enableVR;
    const startupOptionHint =
        state.startupSettingsStatus.changedKeys.length > 0
            ? `開始前だけ効く項目に変更があります: ${state.startupSettingsStatus.changedKeys.join(", ")}`
            : "";

    return (
        <>
            {hasStartupOptions ? <ConnectionStartupSection state={state} /> : null}
            <ConnectionStatusSection state={state} startupOptionHint={startupOptionHint} />
        </>
    );
}

function ConnectionStartupSection({ state }: ConfigurationDialogConnectionPageProps) {
    return (
        <DialogSettingsCategory title={settingsPageCopy.connection.startupSectionTitle}>
            <DialogStartupSettingsSection
                settings={state.settings}
                uiState={state.settingsUiState}
                onApplySettings={state.applySettings}
                startupStatus={state.startupSettingsStatus}
                startupCapabilities={state.startupSettingsCapabilities}
                isRunning={state.lifecycleState === "running"}
                showSectionTitle={false}
            />
        </DialogSettingsCategory>
    );
}

type ConnectionStatusSectionProps = {
    state: ConfigurationDialogSettingsState;
    startupOptionHint: string;
};

function ConnectionStatusSection({ state, startupOptionHint }: ConnectionStatusSectionProps) {
    const connectionDetail = state.connectionState.detail ?? "";

    return (
        <DialogSettingsCategory title={settingsPageCopy.connection.statusSectionTitle}>
            <div className="configurationDialogReactSettingsPanel__connectionPage">
                <div className="configurationDialogReactSettingsPanel__statusPanel">
                    <div className="configurationDialogReactSettingsPanel__statusValue">
                        {connectionStatusLabel(state.connectionState.value)}
                    </div>
                    {connectionDetail ? (
                        <div className="configurationDialogReactSettingsPanel__statusDetail">
                            {connectionDetail}
                        </div>
                    ) : null}
                </div>
                {startupOptionHint ? (
                    <div className="configurationDialogReactSettingsPanel__hintText">
                        {startupOptionHint}
                    </div>
                ) : null}
            </div>
        </DialogSettingsCategory>
    );
}

function connectionStatusLabel(value: string): string {
    switch (value) {
        case "connected":
            return "接続済み";
        case "starting":
            return "開始準備中";
        case "connecting":
            return "接続中";
        case "degraded":
            return "要確認";
        case "stopping":
            return "停止中";
        case "stopped":
        case "idle":
            return "未接続";
        default:
            return value;
    }
}
