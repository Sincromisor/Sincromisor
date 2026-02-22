import { SincroAppController } from "../../ts/App/SincroAppController";

type BindControllerFn = (controller: SincroAppController | null) => (() => void) | void;

// active AppController の差し替え（MPA/initializer再生成）を吸収しつつ、controller.subscribe の解放も一箇所にまとめる。
export function subscribeActiveSincroAppController(bindController: BindControllerFn): () => void {
    let unsubscribeBound: (() => void) | null = null;
    const unsubscribeCurrent = SincroAppController.subscribeCurrent((controller) => {
        if (unsubscribeBound) {
            unsubscribeBound();
            unsubscribeBound = null;
        }
        const next = bindController(controller);
        unsubscribeBound = next ?? null;
    });
    return () => {
        unsubscribeCurrent();
        if (unsubscribeBound) {
            unsubscribeBound();
        }
    };
}
