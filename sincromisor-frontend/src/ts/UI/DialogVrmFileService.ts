// 起動前 dialog で扱う VRM ファイル/サムネイルの永続化を担当する。
// DialogManager から Cache Storage 操作を分離し、UI 状態更新ロジックと責務を分ける。
export class DialogVrmFileService {
    // VRM本体とサムネイルを同一Cache Storageで管理する。
    // 起動時にURL再作成できるよう、文字列URLではなくBlobを保存する。
    private static readonly fileCacheName: string = "file-cache";
    private static readonly vrmFileCacheKey: string = "sincroVrmFile";
    private static readonly vrmThumbnailCacheKey: string = "sincroVrmThumbnail";

    isVrmFile(file: File): boolean {
        return file.name.endsWith(".vrm");
    }

    async saveVrmFile(file: File): Promise<void> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        await cache.put(DialogVrmFileService.vrmFileCacheKey, new Response(file));
    }

    async loadVrmFileBlob(): Promise<Blob | null> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        const response: Response | undefined = await cache.match(DialogVrmFileService.vrmFileCacheKey);
        if (!response) {
            return null;
        }
        return response.blob();
    }

    // 変換済みサムネイル画像(Blob)を保存する。
    async saveVrmThumbnailBlob(blob: Blob): Promise<void> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        await cache.put(DialogVrmFileService.vrmThumbnailCacheKey, new Response(blob));
    }

    // 起動時に前回使用したサムネイルを復元する。
    async loadVrmThumbnailBlob(): Promise<Blob | null> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        const response: Response | undefined = await cache.match(DialogVrmFileService.vrmThumbnailCacheKey);
        if (!response) {
            return null;
        }
        return response.blob();
    }

    // モデル更新時にキャッシュ不整合を防ぐための明示削除。
    async clearVrmThumbnailCache(): Promise<void> {
        const cache = await caches.open(DialogVrmFileService.fileCacheName);
        await cache.delete(DialogVrmFileService.vrmThumbnailCacheKey);
    }
}
