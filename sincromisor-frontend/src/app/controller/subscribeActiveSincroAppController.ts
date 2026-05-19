import { SincroAppController } from "./sincroAppController";

type BindControllerFn = (controller: SincroAppController | undefined) => (() => void) | undefined;

// active AppController の差し替え（MPA/initializer再生成）を吸収しつつ、controller.subscribe の解放も一箇所にまとめる。
export function subscribeActiveSincroAppController(bindController: BindControllerFn): () => void {
    let unsubscribeBound: (() => void) | undefined;
    const unsubscribeCurrent = SincroAppController.subscribeCurrent((controller) => {
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
