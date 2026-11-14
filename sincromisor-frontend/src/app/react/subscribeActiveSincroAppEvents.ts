import type { SincroAppController, SincroAppEvent } from "../controller";
import { subscribeActiveSincroAppController } from "../controller/subscribeActiveSincroAppController";

type ActiveEventOptions = {
    // 有効アプリの差し替え時に画面の保持状態を同期する。
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
