import type { DialogVrmFileService } from "./dialogVrmFileService";

/** 保存成功時のBlob、または選択を維持して案内する検証失敗を返す。URL生成は含めない。 */
export type DialogVrmSelectResult =
    | {
          ok: true;
          vrmBlob: Blob;
          statusText: string;
          popMessage: string;
      }
    | {
          ok: false;
          statusText: string;
          popError: string;
      };

/** 前回のBlobと表示文言。保存がなければBlobを持たず、既定モデルの選択を維持する。 */
export type DialogVrmInitialLoadResult = {
    vrmBlob?: Blob;
    statusText: string;
};

// dialog の VRM 選択/復元フローをまとめる。
// DialogManager は UI 状態更新と通知に集中し、保存/検証の流れは service 側に寄せる。
export class DialogVrmWorkflowService {
    constructor(private readonly fileService: DialogVrmFileService) {}

    /** 形式を検証して保存し、成功後だけ選択用Blobを返す。保存失敗は呼び出し元へ伝播する。 */
    async applySelectedVrmFile(file: File): Promise<DialogVrmSelectResult> {
        // UI通知文言はここで決め、DialogManager 側は結果に応じた state 更新/通知へ専念する。
        if (!this.fileService.isVrmFile(file)) {
            return {
                ok: false,
                statusText: "VRMファイル以外は読み込めません",
                popError: "VRMファイルを選択してください。",
            };
        }

        // サムネイルはモデル差し替え後に再生成されるため先にクリアしておく。
        // 保存成功後にBlobを選択所有者へ返すため、保存失敗時にはURLを生成しない。
        await this.fileService.clearVrmThumbnailCache();
        await this.fileService.saveVrmFile(file);

        return {
            ok: true,
            vrmBlob: new Blob([file], { type: "application/octet-stream" }),
            statusText: `選択中: ${file.name}`,
            popMessage: "VRMファイルを更新しました。",
        };
    }

    /** 保存済みBlobを復元する。URLの生成・保持・解放は選択所有者へ委ねる。 */
    async loadInitialVrmSelection(): Promise<DialogVrmInitialLoadResult> {
        // URLを生成せずBlobだけを返し、選択所有者が生成・差し替え・解放をまとめて行う。
        const blob = await this.fileService.loadVrmFileBlob();
        if (!blob) {
            return {
                statusText: "既定のVRMモデルを使用中",
            };
        }
        return {
            vrmBlob: blob,
            statusText: "前回選択したVRMモデルを使用中",
        };
    }
}
