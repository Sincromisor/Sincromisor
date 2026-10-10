import type { SincroAppDialogVrmUiState } from "../../../../app/controller";

// 起動前 dialog の VRM 置き換え導線（ファイル選択 / D&D状態表示）をまとめる。
type VrmModelSectionProps = {
    onOpenFilePicker: () => void;
};

/** 概要・詳細から同じファイル選択窓口を開く。読込と保存はダイアログ所有者に委ねる。 */
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

/** 選択中のモデルと拒否理由を所有者の状態文で表示し、ドラッグ中だけ操作案内を切り替える。 */
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
