import type { SincroAppEvent } from "../../ts/App/SincroAppTypes";
import { subscribeActiveSincroAppController } from "./subscribeActiveSincroAppController";
import type { SincroAppController } from "../../ts/App/SincroAppController";

type ActiveEventOptions = {
    onControllerChange?: (controller: SincroAppController | null) => void;
    onBeforeSubscribe?: (controller: SincroAppController) => void;
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
        return controller.subscribe((event) => {
            options.onEvent(event, controller);
        });
    });
}
