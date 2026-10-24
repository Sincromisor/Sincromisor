import { SettingsButton } from "../../settings/react/primitives/settingsActionControls";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

type ConfigurationDialogSettingsState = ReturnType<typeof useConfigurationDialogSettingsState>;

type ConfigurationDialogSettingsFooterProps = {
    showDetails: boolean;
    onToggleDetails: () => void;
    currentController: ConfigurationDialogSettingsState["currentController"];
    dialogUiState: ConfigurationDialogSettingsState["dialogUiState"];
    startApp: ConfigurationDialogSettingsState["startApp"];
};

/** 概要・詳細のどちらでも開始条件と表示切り替えを固定領域から操作する。 */
export function ConfigurationDialogSettingsFooter({
    showDetails,
    onToggleDetails,
    currentController,
    dialogUiState,
    startApp,
}: ConfigurationDialogSettingsFooterProps) {
    const startButtonLabel = dialogUiState.startButtonText ?? "開始する";
    const startButtonHint = dialogUiState.startButtonHint ?? "";

    return (
        <div className="configurationDialogReactSettingsPanel__footer">
            <div className="configurationDialogReactSettingsPanel__footerLead">
                <SettingsButton type="button" onClick={onToggleDetails} data-startup-view-toggle>
                    {showDetails ? "開始画面へ戻る" : "詳しい設定"}
                </SettingsButton>
                <a className="configurationDialogReactSettingsPanel__backLink" href="/">
                    トップへ戻る
                </a>
            </div>
            <div className="configurationDialogReactSettingsPanel__primaryAction">
                <SettingsButton
                    type="button"
                    tone="primary"
                    className="configurationDialogReactSettingsPanel__startButton"
                    onClick={startApp}
                    disabled={!currentController || dialogUiState.startButtonDisabled}
                >
                    {startButtonLabel}
                </SettingsButton>
                {startButtonHint ? (
                    <div className="configurationDialogReactSettingsPanel__hintText">
                        {startButtonHint}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
