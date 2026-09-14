// 起動前 dialog で扱う VRM ファイル/サムネイルの永続化を担当する。
// DialogManager から Cache Storage 操作を分離し、UI 状態更新ロジックと責務を分ける。
export class DialogVrmFileService {
    // VRM本体とサムネイルを同一Cache Storageで管理する。
    // 起動時にURL再作成できるよう、文字列URLではなくBlobを保存する。
    private static readonly fileCacheName: string = "file-cache";
    private static readonly vrmFileCacheKey: string = "sincroVrmFile";
    private static readonly vrmThumbnailCacheKey: string = "sincroVrmThumbnail";

    /** 初期化後の古い選択処理・非同期サムネイル生成からの再保存を、再読込まで停止する。 */
    private static writesStopped = false;
    private static readonly pendingWrites = new Set<Promise<void>>();

    isVrmFile(file: File): boolean {
        // 拡張子判定のみ。内容検証は読み込み側/VRMロード側で扱う。
        return file.name.endsWith(".vrm");
    }

    async saveVrmFile(file: File): Promise<void> {
        await this.saveBlob(DialogVrmFileService.vrmFileCacheKey, file);
    }

    async loadVrmFileBlob(): Promise<Blob | undefined> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        const response: Response | undefined = await cache.match(
            DialogVrmFileService.vrmFileCacheKey,
        );
        if (!response) {
            return undefined;
        }
        // 呼び出し側で ObjectURL 化して scene に渡す。
        return response.blob();
    }

    // 変換済みサムネイル画像(Blob)を保存する。
    async saveVrmThumbnailBlob(blob: Blob): Promise<void> {
        await this.saveBlob(DialogVrmFileService.vrmThumbnailCacheKey, blob);
    }

    // 起動時に前回使用したサムネイルを復元する。
    async loadVrmThumbnailBlob(): Promise<Blob | undefined> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        const response: Response | undefined = await cache.match(
            DialogVrmFileService.vrmThumbnailCacheKey,
        );
        if (!response) {
            return undefined;
        }
        return response.blob();
    }

    // モデル更新時にキャッシュ不整合を防ぐための明示削除。
    async clearVrmThumbnailCache(): Promise<void> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        await cache.delete(DialogVrmFileService.vrmThumbnailCacheKey);
    }

    /** 開始済みの書込みを待ってから、全対象ページで保存した本体・サムネイルだけを削除する。 */
    static async clearSavedSelection(): Promise<void> {
        DialogVrmFileService.writesStopped = true;
        await Promise.allSettled(DialogVrmFileService.pendingWrites);
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        const directories = [
            "/",
            "/simple-vrm/",
            "/vrm360/",
            "/looking-glass-vrm/",
            "/pages/simpleVrm/",
            "/pages/vrm360/",
            "/pages/lookingGlassVrm/",
        ];
        const paths = new Set(
            directories.flatMap((directory) => [
                directory + DialogVrmFileService.vrmFileCacheKey,
                directory + DialogVrmFileService.vrmThumbnailCacheKey,
            ]),
        );
        for (const request of await cache.keys()) {
            const url = new URL(request.url);
            if (url.origin === window.location.origin && paths.has(url.pathname)) {
                await cache.delete(request);
            }
        }
    }

    /** 初期化との競合を避けるため、Cache Storageへの書込みをページ全体で追跡する。 */
    private async saveBlob(key: string, blob: Blob): Promise<void> {
        if (DialogVrmFileService.writesStopped) return;
        const writing = (async () => {
            const cache = await caches.open(DialogVrmFileService.fileCacheName);
            await cache.put(key, new Response(blob));
        })();
        DialogVrmFileService.pendingWrites.add(writing);
        try {
            await writing;
        } finally {
            DialogVrmFileService.pendingWrites.delete(writing);
        }
    }
}
