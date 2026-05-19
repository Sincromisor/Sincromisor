import { useEffect } from "react";
import type { SincroAppController, SincroAppEvent } from "../../app/controller";
import {
    hydrateDialogUiSnapshotsFromController,
    hydrateSettingsSnapshotsFromController,
} from "../app/sincroAppStateSnapshotHydrators";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";
import type { ConfigurationDialogStateSetters } from "./configurationDialogStateGroups";

export function useConfigurationDialogControllerSubscription(
    setters: ConfigurationDialogStateSetters,
): void {
    useEffect(() => {
        const unsubscribeActiveController = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                hydrateConfigurationDialogFromController(controller, setters);
            },
            onEvent: (event) => {
                applyConfigurationDialogEvent(event, setters);
            },
        });
        return () => {
            unsubscribeActiveController();
        };
    }, [setters]);
}

function hydrateConfigurationDialogFromController(
    controller: SincroAppController | undefined,
    setters: ConfigurationDialogStateSetters,
): void {
    setters.setCurrentController(controller);
    if (!controller) {
        return;
    }
    // active controller 差し替え時も subscribe 初回イベント前に最低限の snapshot を反映して空白を減らす。
    hydrateSettingsSnapshotsFromController(controller, {
        setSettings: setters.setSettings,
        setSettingsUiState: setters.setSettingsUiState,
        setSettingsUiHints: setters.setSettingsUiHints,
    });
    hydrateDialogUiSnapshotsFromController(controller, {
        setDialogUiState: setters.setDialogUiState,
        setDialogVrmUiState: setters.setDialogVrmUiState,
    });
    setters.setStartupSettingsStatus(controller.state.getStartupSettingsStatus());
}

function applyConfigurationDialogEvent(
    event: SincroAppEvent,
    setters: ConfigurationDialogStateSetters,
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
        case "dialog_vrm_ui_state":
            setters.setDialogVrmUiState(event.uiState);
            return;
        case "dialog_ui_state":
            setters.setDialogUiState(event.uiState);
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
