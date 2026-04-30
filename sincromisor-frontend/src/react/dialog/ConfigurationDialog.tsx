import { useEffect, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type { SincroAppDialogUiState, SincroAppEvent } from "../../ts/App/SincroAppTypes";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";
import { StartupDialogFrame } from "../overlay/StartupDialogFrame";
import { ConfigurationDialogSettingsPanel } from "./ConfigurationDialogSettingsPanel";
import { DialogPopMessages } from "./DialogPopMessages";
import { useConfigurationDialogPlatformState } from "./useConfigurationDialogPlatformState";

const defaultDialogUiState: SincroAppDialogUiState = {
    isOpen: false,
    startButtonDisabled: false,
    startButtonText: "開始する",
    startButtonHint: null,
};

// 起動前 dialog の native dialog 要素と React UI を束ねる root component。
// visible UI は React が所有し、HTMLDialogElement の開閉同期だけを platform hook 経由で扱う。
export function ConfigurationDialog() {
    const initialController = SincroAppController.getCurrent();
    const [currentController, setCurrentController] = useState<SincroAppController | null>(initialController);
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
        <dialog id="configurationDialog" ref={dialogRef}>
            <StartupDialogFrame popLayer={<DialogPopMessages />}>
                <ConfigurationDialogSettingsPanel />
            </StartupDialogFrame>
        </dialog>
    );
}
