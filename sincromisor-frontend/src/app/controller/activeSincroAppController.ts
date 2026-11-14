import { sincroAppActiveControllerRegistry } from "./sincroAppActiveControllerRegistry";
import type { SincroAppController } from "./sincroAppController";

/** 実行時サービスを読み込まず、現在有効なアプリ制御を取得する。未登録時はundefined。 */
export function getActiveSincroAppController(): SincroAppController | undefined {
    return sincroAppActiveControllerRegistry.getCurrent();
}

/** 現在値を即時通知し、同一インスタンスの再指定と登録解除も通知する。戻り値で購読を解除する。 */
export function subscribeCurrentSincroAppController(
    listener: (controller: SincroAppController | undefined) => void,
): () => void {
    return sincroAppActiveControllerRegistry.subscribe(listener);
}
