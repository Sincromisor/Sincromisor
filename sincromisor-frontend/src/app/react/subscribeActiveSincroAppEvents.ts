import type { SincroAppController, SincroAppEvent } from "../controller";
import { subscribeActiveSincroAppController } from "../controller";

type ActiveEventOptions = {
    // active controller 差し替え時の local state 同期用。
    onControllerChange?: (controller: SincroAppController | undefined) => void;
    onEvent: (event: SincroAppEvent, controller: SincroAppController) => void;
};

/** 有効な制御処理の変更に追従してイベントを購読する。差し替え・解除時に旧購読も解除する。 */
export function subscribeActiveSincroAppEvents(options: ActiveEventOptions): () => void {
    return subscribeActiveSincroAppController((controller) => {
        options.onControllerChange?.(controller);
        if (!controller) {
            return;
        }
        return controller.subscribe((event) => {
            options.onEvent(event, controller);
        });
    });
}
