import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import type {
    SincroAppController,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../controller";
import { SincroAppController as SincroAppControllerClass } from "../controller";
import {
    createDefaultSincroAppSettingsSnapshot,
    createDefaultSincroAppSettingsUiState,
    createDefaultSincroAppStartupSettingsCapabilities,
    createDefaultSincroAppStartupSettingsStatus,
    defaultSincroAppSettingsUiHints,
} from "../settings/sincroAppSettingsDefaults";
import { hydrateStartupSettingsStatusFromController } from "./sincroAppStateSnapshotHydrators";
import { subscribeActiveSincroAppEvents } from "./subscribeActiveSincroAppEvents";

/** 接続状態の案内表示に使う直近のイベント値。 */
export type SincroAppControllerConnectionState = {
    value: Extract<SincroAppEvent, { type: "connection_state" }>["value"];
    detail: string;
};

/** 起動前ダイアログと起動後パネルで共有する設定・接続状態。 */
export type SincroAppControllerSettingsState = {
    hasActiveController: boolean;
    currentController: SincroAppController | undefined;
    lifecycleState: SincroAppLifecycleState;
    connectionState: SincroAppControllerConnectionState;
    settings: SincroAppSettingsSnapshot;
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
};

type SincroAppControllerSettingsStateSetters = {
    setHasActiveController: (value: boolean) => void;
    setCurrentController: (value: SincroAppController | undefined) => void;
    setLifecycleState: (value: SincroAppLifecycleState) => void;
    setConnectionState: (value: SincroAppControllerConnectionState) => void;
    setStartupSettingsStatus: (value: SincroAppStartupSettingsStatus) => void;
    setStartupSettingsCapabilities: (value: SincroAppStartupSettingsCapabilities) => void;
};

type UseSincroAppControllerSettingsStateOptions = {
    initialController?: SincroAppController | undefined;
    resetLifecycleOnControllerClear?: boolean;
    onControllerHydrated?: (controller: SincroAppController) => void;
    onControllerCleared?: () => void;
    onEvent?: (event: SincroAppEvent, controller: SincroAppController) => void;
};

const defaultConnectionState: SincroAppControllerConnectionState = {
    value: "idle",
    detail: "",
};

// 制御処理のない初回表示でも、外部ストアの取得結果を安定させる。
const defaultSettingsSnapshot = {
    settings: createDefaultSincroAppSettingsSnapshot(),
    settingsUiState: createDefaultSincroAppSettingsUiState(),
    settingsUiHints: defaultSincroAppSettingsUiHints,
};
const getDefaultSettingsSnapshot = () => defaultSettingsSnapshot;
const subscribeEmptySettings = () => () => {};

/** 設定は外部ストアから読み取り、起動・接続・ページ固有状態だけをイベントで同期する。 */
export function useSincroAppControllerSettingsState(
    options: UseSincroAppControllerSettingsStateOptions = {},
): SincroAppControllerSettingsState {
    const initialController = options.initialController ?? SincroAppControllerClass.getCurrent();
    const [hasActiveController, setHasActiveController] = useState<boolean>(!!initialController);
    const [currentController, setCurrentController] = useState<SincroAppController | undefined>(
        initialController,
    );
    const [lifecycleState, setLifecycleState] = useState<SincroAppLifecycleState>("idle");
    const [connectionState, setConnectionState] =
        useState<SincroAppControllerConnectionState>(defaultConnectionState);
    const settingsSnapshot = useSyncExternalStore(
        currentController?.settingsStore.subscribe ?? subscribeEmptySettings,
        currentController?.settingsStore.getSnapshot ?? getDefaultSettingsSnapshot,
        currentController?.settingsStore.getSnapshot ?? getDefaultSettingsSnapshot,
    );
    const [startupSettingsStatus, setStartupSettingsStatus] =
        useState<SincroAppStartupSettingsStatus>(
            initialController?.state.getStartupSettingsStatus() ??
                createDefaultSincroAppStartupSettingsStatus(),
        );
    const [startupSettingsCapabilities, setStartupSettingsCapabilities] =
        useState<SincroAppStartupSettingsCapabilities>(
            createDefaultSincroAppStartupSettingsCapabilities(),
        );
    const setters = useMemo<SincroAppControllerSettingsStateSetters>(
        () => ({
            setHasActiveController,
            setCurrentController,
            setLifecycleState,
            setConnectionState,
            setStartupSettingsStatus,
            setStartupSettingsCapabilities,
        }),
        [],
    );

    // ページ固有のコールバックは最新の描画を参照するが、関数の作り直しでは再購読しない。
    // 初期状態の再配信で再描画・再購読を繰り返すことを防ぐ。
    const onControllerChange = useEffectEvent((controller: SincroAppController | undefined) => {
        syncSincroAppControllerSettingsState(controller, setters, {
            resetLifecycleOnControllerClear: !!options.resetLifecycleOnControllerClear,
            onControllerHydrated: options.onControllerHydrated,
            onControllerCleared: options.onControllerCleared,
        });
    });
    const onEvent = useEffectEvent((event: SincroAppEvent, controller: SincroAppController) => {
        applySincroAppControllerSettingsEvent(event, setters);
        options.onEvent?.(event, controller);
    });
    useEffect(
        () =>
            subscribeActiveSincroAppEvents({
                onControllerChange: (controller) => onControllerChange(controller),
                onEvent: (event, controller) => onEvent(event, controller),
            }),
        [],
    );

    return {
        hasActiveController,
        currentController,
        lifecycleState,
        connectionState,
        ...settingsSnapshot,
        startupSettingsStatus,
        startupSettingsCapabilities,
    };
}

function syncSincroAppControllerSettingsState(
    controller: SincroAppController | undefined,
    setters: SincroAppControllerSettingsStateSetters,
    options: Pick<
        UseSincroAppControllerSettingsStateOptions,
        "resetLifecycleOnControllerClear" | "onControllerHydrated" | "onControllerCleared"
    >,
): void {
    setters.setCurrentController(controller);
    setters.setHasActiveController(!!controller);
    if (!controller) {
        if (options.resetLifecycleOnControllerClear) {
            setters.setLifecycleState("idle");
        }
        options.onControllerCleared?.();
        return;
    }
    hydrateStartupSettingsStatusFromController(controller, setters);
    options.onControllerHydrated?.(controller);
}

function applySincroAppControllerSettingsEvent(
    event: SincroAppEvent,
    setters: SincroAppControllerSettingsStateSetters,
): void {
    switch (event.type) {
        case "lifecycle":
            setters.setLifecycleState(event.state);
            return;
        case "connection_state":
            setters.setConnectionState({ value: event.value, detail: event.detail ?? "" });
            return;
        case "startup_settings_status":
            setters.setStartupSettingsStatus(event.status);
            return;
        case "startup_settings_capabilities":
            setters.setStartupSettingsCapabilities(event.capabilities);
            return;
        default:
            return;
    }
}
