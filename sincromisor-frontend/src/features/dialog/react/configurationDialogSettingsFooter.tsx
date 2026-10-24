import { useId } from "react";
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

/** 切り替えと開始を同じ操作行に置く。開始条件の案内は独立した行でボタンに関連付ける。 */
export function ConfigurationDialogSettingsFooter({
    showDetails,
    onToggleDetails,
    currentController,
    dialogUiState,
    startApp,
}: ConfigurationDialogSettingsFooterProps) {
    const hintId = useId();
    const startButtonLabel = dialogUiState.startButtonText ?? "開始する";
    const startButtonHint = dialogUiState.startButtonHint ?? "";

    return (
        <div className="configurationDialogReactSettingsPanel__footer">
            <SettingsButton type="button" onClick={onToggleDetails} data-startup-view-toggle>
                {showDetails ? "開始画面へ戻る" : "詳しい設定"}
            </SettingsButton>
            <SettingsButton
                type="button"
                tone="primary"
                className="configurationDialogReactSettingsPanel__startButton"
                onClick={startApp}
                disabled={!currentController || dialogUiState.startButtonDisabled}
                aria-describedby={startButtonHint ? hintId : undefined}
            >
                {startButtonLabel}
            </SettingsButton>
            {startButtonHint ? (
                <div id={hintId} className="configurationDialogReactSettingsPanel__hintText">
                    {startButtonHint}
                </div>
            ) : null}
        </div>
    );
}
