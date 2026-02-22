import type { SincroAppDialogVrmUiState } from "../../../ts/App/SincroAppController";

type VrmModelSectionProps = {
    onOpenFilePicker: () => void;
};

export function VrmModelSection({ onOpenFilePicker }: VrmModelSectionProps) {
    return (
        <div className="configurationDialogReactSettingsPanel__vrmSection">
            <div className="configurationDialogReactSettingsPanel__subTitle">VRM-1.0 モデル</div>
            <div className="configurationDialogReactSettingsPanel__caption">
                ファイル選択またはこの画面へのドラッグ&ドロップでモデルを差し替えます。
            </div>
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
    return (
        <div className={`configurationDialogReactSettingsPanel__vrmDropStatus${uiState.isDragOver ? " is-dragover" : ""}`}>
            <div className="configurationDialogReactSettingsPanel__statusText">
                {uiState.isDragOver ? "ここにVRMファイルをドロップしてください" : "VRMファイルをここにドラッグ&ドロップ"}
            </div>
            <div className="configurationDialogReactSettingsPanel__statusSubText">{uiState.vrmStatusText}</div>
        </div>
    );
}
