import type {
    SincroAppLookingGlassConfigUpdatedEventDetail,
    SincroAppLookingGlassEventDetail,
} from "../controller/sincroAppTypes";

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

// AppController constructor の window event 登録列挙を分離する helper。
// 今後 unbind が必要になった場合も、ここに対称処理を追加しやすくする。
export function bindSincroAppWindowEvents(handlers: SincroAppWindowEventHandlers): void {
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
}
