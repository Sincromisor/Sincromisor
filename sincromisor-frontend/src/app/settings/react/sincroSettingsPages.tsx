import { useConfigurationDialogSettingsState } from "../../../features/dialog/react/useConfigurationDialogSettingsState";
import { createPurposeSettingsPages } from "../../../features/settings/react/pages/purposeSettingsPages";
import {
    SettingsButton,
    SettingsHint,
} from "../../../features/settings/react/primitives/settingsPrimitives";
import { CameraQualityGuideCard } from "./components/diagnosticsStatusCards";
import { InitialCalibrationRetryCard } from "./components/initialCalibrationRetryCard";
import type { SincroPanelState } from "./sincroControlPanelTypes";

/** 常設側の共通分類へ、現在のVRMとカメラの改善案内・較正操作を加える。 */
export function createSincroSettingsPages(state: SincroPanelState) {
    return createPurposeSettingsPages({
        state,
        character: <CurrentCharacter />,
        camera: (
            <>
                <CameraQualityGuideCard state={state.cameraGuide} />
                <InitialCalibrationRetryCard
                    state={state.calibrationState}
                    onRetry={state.retryCalibration}
                />
            </>
        ),
    });
}

/** VRMの状態はダイアログ所有者から購読し、交換は既存の起動前設定へ戻す。 */
function CurrentCharacter() {
    const { currentController, dialogVrmUiState } = useConfigurationDialogSettingsState();
    return (
        <>
            <SettingsHint>{dialogVrmUiState.vrmStatusText}</SettingsHint>
            <SettingsButton
                type="button"
                disabled={!currentController}
                onClick={() => {
                    currentController?.stop();
                    currentController?.dialog.open();
                }}
            >
                キャラクターを選び直す
            </SettingsButton>
        </>
    );
}
