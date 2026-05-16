import type { SincroAppController } from "../../ts/App/SincroAppController";
import type { SincroAppEvent } from "../../ts/App/SincroAppTypes";
import { subscribeActiveSincroAppController } from "./subscribeActiveSincroAppController";

type ActiveEventOptions = {
    // active controller 差し替え時の local state 同期用。
    onControllerChange?: (controller: SincroAppController | null) => void;
    // controller.subscribe() 前に bridge 設定（DOM 描画停止など）を行うためのフック。
    onBeforeSubscribe?: (controller: SincroAppController) => void;
    // controller 差し替えや React unmount 時に、bridge 設定を元へ戻すためのフック。
    onCleanupController?: (controller: SincroAppController) => void;
    onEvent: (event: SincroAppEvent, controller: SincroAppController) => void;
};

// React hook からの「active controller 追従 + controller.subscribe(event)」の定型配線を共通化する。
// UIごとの差分は onEvent/onControllerChange に閉じる。
export function subscribeActiveSincroAppEvents(options: ActiveEventOptions): () => void {
    return subscribeActiveSincroAppController((controller) => {
        options.onControllerChange?.(controller);
        if (!controller) {
            return;
        }
        options.onBeforeSubscribe?.(controller);
        const unsubscribe = controller.subscribe((event) => {
            options.onEvent(event, controller);
        });
        return () => {
            unsubscribe();
            options.onCleanupController?.(controller);
        };
    });
}
