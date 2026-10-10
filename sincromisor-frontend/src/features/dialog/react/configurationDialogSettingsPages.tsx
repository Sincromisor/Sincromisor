import { createPurposeSettingsPages } from "../../settings/react/pages/purposeSettingsPages";
import { DialogVrmDropStatusCard, VrmModelSection } from "./components/dialogSettingsSections";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

type ConfigurationDialogSettingsState = ReturnType<typeof useConfigurationDialogSettingsState>;

/** 起動前の詳細は共通分類を使い、キャラクター欄だけ既存のVRM選択を接続する。 */
export function createConfigurationDialogSettingsPages({
    state,
    onOpenFilePicker,
}: {
    state: ConfigurationDialogSettingsState;
    onOpenFilePicker: () => void;
}) {
    return createPurposeSettingsPages({
        state,
        character: (
            <>
                <VrmModelSection onOpenFilePicker={onOpenFilePicker} />
                <DialogVrmDropStatusCard uiState={state.dialogVrmUiState} />
            </>
        ),
    });
}
