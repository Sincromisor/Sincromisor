import type {
    SincroAppLookingGlassConfigUpdatedEventDetail,
    SincroAppLookingGlassEventDetail,
} from "./sincroAppTypes";

export type SincroAppWindowEventHandlers = {
    onLookingGlassState: (event: CustomEvent<SincroAppLookingGlassEventDetail>) => void;
    onLookingGlassConfigUpdated: (
        event: CustomEvent<SincroAppLookingGlassConfigUpdatedEventDetail>,
    ) => void;
    onLookingGlassPolyfillReinitReady: () => void;
    onOpenConfigurationDialog: () => void;
};

// AppController constructor の window event 登録列挙を分離する helper。
// 今後 unbind が必要になった場合も、ここに対称処理を追加しやすくする。
export function bindSincroAppWindowEvents(handlers: SincroAppWindowEventHandlers): void {
    window.addEventListener(
        "sincro:looking-glass-state",
        handlers.onLookingGlassState as EventListener,
    );
    window.addEventListener(
        "sincro:looking-glass-config-updated",
        handlers.onLookingGlassConfigUpdated as EventListener,
    );
    window.addEventListener(
        "sincro:looking-glass-polyfill-reinit-ready",
        handlers.onLookingGlassPolyfillReinitReady as EventListener,
    );
    window.addEventListener(
        "sincro:open-configuration-dialog",
        handlers.onOpenConfigurationDialog as EventListener,
    );
}
