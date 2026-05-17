import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

type ConfigurationDialogSettingsState = ReturnType<typeof useConfigurationDialogSettingsState>;

type ConfigurationDialogSettingsFooterProps = {
    currentController: ConfigurationDialogSettingsState["currentController"];
    dialogUiState: ConfigurationDialogSettingsState["dialogUiState"];
    startApp: ConfigurationDialogSettingsState["startApp"];
};

export function ConfigurationDialogSettingsFooter({
    currentController,
    dialogUiState,
    startApp,
}: ConfigurationDialogSettingsFooterProps) {
    const startButtonLabel = dialogUiState.startButtonText ?? "開始する";
    const startButtonHint = dialogUiState.startButtonHint ?? "";

    return (
        <div className="configurationDialogReactSettingsPanel__footer">
            <div className="configurationDialogReactSettingsPanel__footerLead">
                <a className="configurationDialogReactSettingsPanel__backLink" href="/">
                    トップへ戻る
                </a>
            </div>
            <div className="configurationDialogReactSettingsPanel__primaryAction">
                <button
                    type="button"
                    className="configurationDialogReactSettingsPanel__startButton"
                    onClick={startApp}
                    disabled={!currentController || dialogUiState.startButtonDisabled}
                >
                    {startButtonLabel}
                </button>
                {startButtonHint ? (
                    <div className="configurationDialogReactSettingsPanel__hintText">
                        {startButtonHint}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
