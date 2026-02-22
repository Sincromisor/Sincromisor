import { DialogVrmFileService } from "./DialogVrmFileService";

export type DialogVrmSelectResult =
    | {
        ok: true;
        vrmUrl: string;
        statusText: string;
        popMessage: string;
    }
    | {
        ok: false;
        statusText: string;
        popError: string;
    };

export type DialogVrmInitialLoadResult = {
    vrmUrl: string | null;
    statusText: string;
};

// dialog の VRM 選択/復元フローをまとめる。
// DialogManager は UI 状態更新と通知に集中し、保存/検証の流れは service 側に寄せる。
export class DialogVrmWorkflowService {
    constructor(private readonly fileService: DialogVrmFileService) { }

    async applySelectedVrmFile(file: File): Promise<DialogVrmSelectResult> {
        if (!this.fileService.isVrmFile(file)) {
            return {
                ok: false,
                statusText: "VRMファイル以外は読み込めません",
                popError: "VRMファイルを選択してください。",
            };
        }

        const blob = new Blob([file], { type: "application/octet-stream" });
        const vrmUrl = URL.createObjectURL(blob);

        // サムネイルはモデル差し替え後に再生成されるため先にクリアしておく。
        // 失敗しても VRM 本体更新は継続できるため、ここでは握りつぶさずログのみで継続するのが呼び出し側方針。
        await this.fileService.clearVrmThumbnailCache();
        await this.fileService.saveVrmFile(file);

        return {
            ok: true,
            vrmUrl,
            statusText: `選択中: ${file.name}`,
            popMessage: "VRMファイルを更新しました。",
        };
    }

    async loadInitialVrmSelection(): Promise<DialogVrmInitialLoadResult> {
        const blob = await this.fileService.loadVrmFileBlob();
        if (!blob) {
            return {
                vrmUrl: null,
                statusText: "既定のVRMモデルを使用中",
            };
        }
        return {
            vrmUrl: URL.createObjectURL(blob),
            statusText: "前回選択したVRMモデルを使用中",
        };
    }
}
