import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroAppController } from "../controller";

const DEFAULT_SYSTEM_ICON_URL = "/images/icon-system.webp";

/** サムネイルの復元・画像読込・変換と自前URLを所有し、旧モデルの後着結果を捨てる。 */
export class SincroVrmThumbnailController {
    private generation = 0;
    private released = false;
    private generatedUrl?: string;

    constructor(private readonly app: Pick<SincroAppController, "dialog" | "chat">) {}

    /** 選択変更時点で旧モデルの変換とキャッシュ復元を無効にする。表示中アイコンは反映まで保つ。 */
    invalidate(): void {
        ++this.generation;
    }

    /** 初回キャッシュは、その後のモデル選択・反映がなければ即時表示へ使う。 */
    restoreCached(): void {
        const generation = this.generation;
        void this.app.dialog
            .loadVrmThumbnailBlob()
            .then((blob) => {
                if (!blob || !this.isCurrent(generation)) return;
                this.applyBlob(blob);
            })
            .catch((error) => {
                frontendLogger.warn("Failed to load cached VRM thumbnail.", { error });
            });
    }

    /** 現在世代の画像だけを表示・保存する。サムネイルなしのモデルは既定アイコンへ戻す。 */
    update(image: HTMLImageElement | undefined, modelIsCurrent: () => boolean): void {
        const generation = ++this.generation;
        const isCurrent = () => this.isCurrent(generation) && modelIsCurrent();
        if (!image) {
            if (!isCurrent()) return;
            this.applyIcon(DEFAULT_SYSTEM_ICON_URL);
            void this.app.dialog.clearVrmThumbnailCache().catch((error) => {
                frontendLogger.warn("Failed to clear VRM thumbnail.", { error });
            });
            return;
        }
        if (!image.complete) {
            void image
                .decode()
                .then(() => {
                    if (isCurrent()) this.convert(image, isCurrent);
                })
                .catch((error) => {
                    if (!isCurrent()) return;
                    frontendLogger.warn("Failed to decode VRM thumbnail.", { error });
                    this.applyIcon(DEFAULT_SYSTEM_ICON_URL);
                });
            return;
        }
        this.convert(image, isCurrent);
    }

    private convert(image: HTMLImageElement, isCurrent: () => boolean): void {
        if (!isCurrent()) return;
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
            this.applyIcon(DEFAULT_SYSTEM_ICON_URL);
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
            this.applyIcon(image.src);
            return;
        }
        try {
            context.drawImage(image, 0, 0, width, height);
        } catch (error) {
            frontendLogger.warn("Failed to draw VRM thumbnail image.", { error });
            this.applyIcon(image.src);
            return;
        }
        canvas.toBlob((blob) => {
            if (!isCurrent()) return;
            if (!blob) {
                this.applyIcon(image.src);
                return;
            }
            void this.app.dialog.saveVrmThumbnailBlob(blob).catch((error) => {
                frontendLogger.warn("Failed to cache VRM thumbnail.", { error });
            });
            this.applyBlob(blob);
        }, "image/png");
    }

    private isCurrent(generation: number): boolean {
        return !this.released && generation === this.generation;
    }
    private applyBlob(blob: Blob): void {
        const url = URL.createObjectURL(blob);
        if (this.generatedUrl) URL.revokeObjectURL(this.generatedUrl);
        // 同期購読でアプリが解除されても、通知前に登録した自前URLを解放できる。
        this.generatedUrl = url;
        this.app.chat.setSystemIcon(url);
    }

    private applyIcon(url: string): void {
        if (url === this.generatedUrl) return;
        if (this.generatedUrl) URL.revokeObjectURL(this.generatedUrl);
        // image.srcがBlob URLでも所有権は取得しない。自前生成はapplyBlobだけで記録する。
        this.generatedUrl = undefined;
        this.app.chat.setSystemIcon(url);
    }

    /** アプリ解除後の後着画像を無効にし、自前のアイコンURLだけを解放する。 */
    release(): void {
        this.released = true;
        this.invalidate();
        if (this.generatedUrl) URL.revokeObjectURL(this.generatedUrl);
        this.generatedUrl = undefined;
    }
}
