import {
    ExperienceSettingsFields,
    PurposeDeviceField,
} from "../../settings/react/pages/purposeSettingsPages";
import { DialogVrmDropStatusCard, VrmModelSection } from "./components/dialogSettingsSections";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

/** 開始に必要な体験・モデル・入力だけを見せ、細かい調整は詳細表示へ委ねる。 */
export function ConfigurationDialogOverview({
    state,
    onOpenFilePicker,
}: {
    state: ReturnType<typeof useConfigurationDialogSettingsState>;
    onOpenFilePicker: () => void;
}) {
    return (
        <div className="configurationDialogReactSettingsPanel__overview">
            <ExperienceSettingsFields state={state} />
            <section aria-label="現在のキャラクター">
                <h2>キャラクター</h2>
                <VrmModelSection onOpenFilePicker={onOpenFilePicker} />
                <DialogVrmDropStatusCard uiState={state.dialogVrmUiState} />
            </section>
            <PurposeDeviceField state={state} kind="audio" />
            {state.settings.enableCharacterGaze ? (
                <PurposeDeviceField state={state} kind="video" />
            ) : null}
        </div>
    );
}
