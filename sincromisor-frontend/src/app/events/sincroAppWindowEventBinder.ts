import type {
    SincroAppLookingGlassConfigUpdatedEventDetail,
    SincroAppLookingGlassEventDetail,
} from "../controller/sincroAppTypes";

/** アプリが受け取るウィンドウ通知。登録時と解除時に同じ関数参照を使う。 */
export type SincroAppWindowEventHandlers = {
    onLookingGlassState: (event: CustomEvent<SincroAppLookingGlassEventDetail>) => void;
    onLookingGlassConfigUpdated: (
        event: CustomEvent<SincroAppLookingGlassConfigUpdatedEventDetail>,
    ) => void;
    onLookingGlassPolyfillReinitReady: () => void;
    onOpenConfigurationDialog: () => void;
};

declare global {
    interface WindowEventMap {
        "sincro:looking-glass-state": CustomEvent<SincroAppLookingGlassEventDetail>;
        "sincro:looking-glass-config-updated": CustomEvent<SincroAppLookingGlassConfigUpdatedEventDetail>;
        "sincro:looking-glass-polyfill-reinit-ready": Event;
        "sincro:looking-glass-start-request": Event;
        "sincro:looking-glass-stop-request": Event;
        "sincro:open-configuration-dialog": Event;
    }
}

/** ウィンドウ通知を登録し、同じ登録だけを繰り返し安全に解除できる関数を返す。 */
export function bindSincroAppWindowEvents(handlers: SincroAppWindowEventHandlers): () => void {
    window.addEventListener("sincro:looking-glass-state", handlers.onLookingGlassState);
    window.addEventListener(
        "sincro:looking-glass-config-updated",
        handlers.onLookingGlassConfigUpdated,
    );
    window.addEventListener(
        "sincro:looking-glass-polyfill-reinit-ready",
        handlers.onLookingGlassPolyfillReinitReady,
    );
    window.addEventListener("sincro:open-configuration-dialog", handlers.onOpenConfigurationDialog);
    return () => {
        window.removeEventListener("sincro:looking-glass-state", handlers.onLookingGlassState);
        window.removeEventListener(
            "sincro:looking-glass-config-updated",
            handlers.onLookingGlassConfigUpdated,
        );
        window.removeEventListener(
            "sincro:looking-glass-polyfill-reinit-ready",
            handlers.onLookingGlassPolyfillReinitReady,
        );
        window.removeEventListener(
            "sincro:open-configuration-dialog",
            handlers.onOpenConfigurationDialog,
        );
    };
}
