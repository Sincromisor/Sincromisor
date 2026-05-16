import type { SincroAppDialogVrmUiState } from "../../../ts/App/SincroAppController";

// 起動前 dialog の VRM 置き換え導線（ファイル選択 / D&D状態表示）をまとめる。
type VrmModelSectionProps = {
    onOpenFilePicker: () => void;
};

export function VrmModelSection({ onOpenFilePicker }: VrmModelSectionProps) {
    return (
        <div className="configurationDialogReactSettingsPanel__vrmSection">
            <div className="configurationDialogReactSettingsPanel__subTitle">VRM-1.0 モデル</div>
            <button
                type="button"
                onClick={onOpenFilePicker}
                className="configurationDialogReactSettingsPanel__button"
            >
                VRM ファイルを選択
            </button>
        </div>
    );
}

type DialogVrmDropStatusCardProps = {
    uiState: SincroAppDialogVrmUiState;
};

export function DialogVrmDropStatusCard({ uiState }: DialogVrmDropStatusCardProps) {
    // dragover 中は「ここへドロップ」へ切り替え、平常時は導線説明を短く表示する。
    return (
        <div
            className={`configurationDialogReactSettingsPanel__vrmDropStatus${uiState.isDragOver ? " is-dragover" : ""}`}
        >
            <div className="configurationDialogReactSettingsPanel__statusText">
                {uiState.isDragOver
                    ? "ここにVRMファイルをドロップしてください"
                    : "VRMファイルをここにドラッグ&ドロップ"}
            </div>
            <div className="configurationDialogReactSettingsPanel__statusSubText">
                {uiState.vrmStatusText}
            </div>
        </div>
    );
}
