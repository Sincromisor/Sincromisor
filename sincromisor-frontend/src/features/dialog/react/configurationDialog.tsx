import { useEffect, useState } from "react";
import type { SincroAppDialogUiState, SincroAppEvent } from "../../../app/controller";
import { SincroAppController } from "../../../app/controller";
import { subscribeActiveSincroAppEvents } from "../../../app/react/subscribeActiveSincroAppEvents";
import { StartupDialogFrame } from "../../../app/shell/react/overlay/startupDialogFrame";
import { ConfigurationDialogSettingsPanel } from "./configurationDialogSettingsPanel";
import { DialogPopMessages } from "./dialogPopMessages";
import { useConfigurationDialogPlatformState } from "./useConfigurationDialogPlatformState";

const defaultDialogUiState: SincroAppDialogUiState = {
    isOpen: false,
    startButtonDisabled: false,
    startButtonText: "開始する",
};

// 起動前 dialog の native dialog 要素と React UI を束ねる root component。
// visible UI は React が所有し、HTMLDialogElement の開閉同期だけを platform hook 経由で扱う。
export function ConfigurationDialog() {
    const initialController = SincroAppController.getCurrent();
    const [currentController, setCurrentController] = useState<SincroAppController | undefined>(
        initialController,
    );
    const [dialogUiState, setDialogUiState] = useState<SincroAppDialogUiState>(
        initialController?.state.getDialogUiState() ?? defaultDialogUiState,
    );

    useEffect(() => {
        return subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                setCurrentController(controller);
                setDialogUiState(controller?.state.getDialogUiState() ?? defaultDialogUiState);
            },
            onEvent: (event: SincroAppEvent) => {
                if (event.type !== "dialog_ui_state") {
                    return;
                }
                setDialogUiState(event.uiState);
            },
        });
    }, []);

    const { dialogRef } = useConfigurationDialogPlatformState({
        isOpen: dialogUiState.isOpen,
        onClosed: () => {
            currentController?.dialog.close();
        },
    });

    return (
        <dialog id="configurationDialog" ref={dialogRef} aria-hidden={!dialogUiState.isOpen}>
            {dialogUiState.isOpen ? (
                <StartupDialogFrame popLayer={<DialogPopMessages />}>
                    <ConfigurationDialogSettingsPanel />
                </StartupDialogFrame>
            ) : null}
        </dialog>
    );
}
