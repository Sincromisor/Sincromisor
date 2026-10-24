import { useId } from "react";
import type { SincroAppDialogVrmUiState } from "../../../../app/controller";
import { SettingsButton } from "../../../settings/react/primitives/settingsActionControls";

type VrmModelSectionProps = {
    onOpenFilePicker: () => void;
    uiState: SincroAppDialogVrmUiState;
};

/** 概要・詳細でモデル状態と交換操作を共有する。ドロップ受付は親のfieldset全体が所有する。 */
export function VrmModelSection({ onOpenFilePicker, uiState }: VrmModelSectionProps) {
    const statusId = useId();
    return (
        <section
            aria-label="キャラクター（VRM 1.0）"
            className={`configurationDialogReactSettingsPanel__vrmDropStatus${uiState.isDragOver ? " is-dragover" : ""}`}
        >
            <div className="configurationDialogReactSettingsPanel__vrmActions">
                <SettingsButton
                    type="button"
                    onClick={onOpenFilePicker}
                    aria-describedby={statusId}
                >
                    VRMファイルを選択
                </SettingsButton>
                <span>VRM 1.0</span>
            </div>
            <div id={statusId} role="status">
                {uiState.vrmStatusText}
            </div>
            {uiState.isDragOver ? <div>ここにドロップ</div> : null}
        </section>
    );
}
