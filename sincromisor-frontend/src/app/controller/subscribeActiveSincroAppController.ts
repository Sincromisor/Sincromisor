import { subscribeCurrentSincroAppController } from "./activeSincroAppController";
import type { SincroAppController } from "./sincroAppController";

type BindControllerFn = (controller: SincroAppController | undefined) => (() => void) | undefined;

/** 現在のアプリへ即時接続し、差し替え時は旧購読を外してから再接続する。戻り値で両購読を解除する。 */
export function subscribeActiveSincroAppController(bindController: BindControllerFn): () => void {
    let unsubscribeBound: (() => void) | undefined;
    const unsubscribeCurrent = subscribeCurrentSincroAppController((controller) => {
        if (unsubscribeBound) {
            unsubscribeBound();
            unsubscribeBound = undefined;
        }
        const next = bindController(controller);
        unsubscribeBound = next;
    });
    return () => {
        unsubscribeCurrent();
        if (unsubscribeBound) {
            unsubscribeBound();
            unsubscribeBound = undefined;
        }
    };
}
