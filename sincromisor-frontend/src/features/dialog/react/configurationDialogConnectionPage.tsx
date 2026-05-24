import { SettingsCategorySection } from "../../settings/react/sections/settingsCategorySection";
import {
    connectionStatusLabel,
    createStartupOptionHint,
} from "../../settings/react/sections/settingsConnectionText";
import { settingsPageCopy } from "../../settings/react/shell/settingsPageCopy";
import { DialogStartupSettingsSection } from "./components/dialogSettingsFormSections";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

type ConfigurationDialogSettingsState = ReturnType<typeof useConfigurationDialogSettingsState>;

type ConfigurationDialogConnectionPageProps = {
    state: ConfigurationDialogSettingsState;
};

export function ConfigurationDialogConnectionPage({
    state,
}: ConfigurationDialogConnectionPageProps) {
    const hasStartupOptions = state.startupSettingsCapabilities.enableVR;
    const startupOptionHint = createStartupOptionHint(state.startupSettingsStatus);

    return (
        <>
            {hasStartupOptions ? <ConnectionStartupSection state={state} /> : null}
            <ConnectionStatusSection state={state} startupOptionHint={startupOptionHint} />
        </>
    );
}

function ConnectionStartupSection({ state }: ConfigurationDialogConnectionPageProps) {
    return (
        <SettingsCategorySection title={settingsPageCopy.connection.startupSectionTitle}>
            <DialogStartupSettingsSection
                settings={state.settings}
                uiState={state.settingsUiState}
                onApplySettings={state.applySettings}
                startupStatus={state.startupSettingsStatus}
                startupCapabilities={state.startupSettingsCapabilities}
                isRunning={state.lifecycleState === "running"}
                showSectionTitle={false}
            />
        </SettingsCategorySection>
    );
}

type ConnectionStatusSectionProps = {
    state: ConfigurationDialogSettingsState;
    startupOptionHint: string;
};

function ConnectionStatusSection({ state, startupOptionHint }: ConnectionStatusSectionProps) {
    const connectionDetail = state.connectionState.detail ?? "";

    return (
        <SettingsCategorySection title={settingsPageCopy.connection.statusSectionTitle}>
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
        </SettingsCategorySection>
    );
}
