import { useEffect, useMemo, useState } from "react";
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
import {
    hydrateSettingsSnapshotsFromController,
    hydrateStartupSettingsStatusFromController,
} from "./sincroAppStateSnapshotHydrators";
import { subscribeActiveSincroAppEvents } from "./subscribeActiveSincroAppEvents";

export type SincroAppControllerConnectionState = {
    value: Extract<SincroAppEvent, { type: "connection_state" }>["value"];
    detail: string;
};

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
    setSettings: (
        value:
            | SincroAppSettingsSnapshot
            | ((prev: SincroAppSettingsSnapshot) => SincroAppSettingsSnapshot),
    ) => void;
    setSettingsUiState: (value: SincroAppSettingsUiState) => void;
    setSettingsUiHints: (value: SincroAppSettingsUiHints) => void;
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

// AppController 由来の設定・接続 state を React UI 向け snapshot として集約する。
// 画面固有イベントは onEvent/onControllerHydrated で合成し、購読入口はこの hook に寄せる。
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
    const [settings, setSettings] = useState<SincroAppSettingsSnapshot>(
        initialController?.state.getSettingsSnapshot() ?? createDefaultSincroAppSettingsSnapshot(),
    );
    const [settingsUiState, setSettingsUiState] = useState<SincroAppSettingsUiState>(
        initialController?.state.getSettingsUiState() ?? createDefaultSincroAppSettingsUiState(),
    );
    const [settingsUiHints, setSettingsUiHints] = useState<SincroAppSettingsUiHints>(
        initialController?.state.getSettingsUiHints() ?? defaultSincroAppSettingsUiHints,
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
            setSettings,
            setSettingsUiState,
            setSettingsUiHints,
            setStartupSettingsStatus,
            setStartupSettingsCapabilities,
        }),
        [],
    );

    useEffect(() => {
        const unsubscribeActiveController = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                syncSincroAppControllerSettingsState(controller, setters, {
                    resetLifecycleOnControllerClear: !!options.resetLifecycleOnControllerClear,
                    onControllerHydrated: options.onControllerHydrated,
                    onControllerCleared: options.onControllerCleared,
                });
            },
            onEvent: (event, controller) => {
                applySincroAppControllerSettingsEvent(event, setters);
                options.onEvent?.(event, controller);
            },
        });
        return () => {
            unsubscribeActiveController();
        };
    }, [
        options.onControllerHydrated,
        options.onControllerCleared,
        options.onEvent,
        options.resetLifecycleOnControllerClear,
        setters,
    ]);

    return {
        hasActiveController,
        currentController,
        lifecycleState,
        connectionState,
        settings,
        settingsUiState,
        settingsUiHints,
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
    hydrateSettingsSnapshotsFromController(controller, setters);
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
        case "settings_snapshot":
            setters.setSettings((prev) => ({ ...prev, ...event.settings }));
            return;
        case "settings_ui_state":
            setters.setSettingsUiState(event.uiState);
            return;
        case "settings_ui_hints":
            setters.setSettingsUiHints(event.uiHints);
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
