import type { SincroAppController } from "../../ts/App/SincroAppController";
import type { ApplySettingsFn } from "../app/appSettingsTypes";

export function buildConfigurationDialogActions(
    currentController: SincroAppController | undefined,
) {
    const applySettings: ApplySettingsFn = (partial) => {
        currentController?.applySettings(partial);
    };
    return {
        applySettings,
        changeTalkMode: (nextTalkMode: string): void => {
            applySettings({ talkMode: nextTalkMode });
        },
        applySelectedVrmFile: (file: File): void => {
            currentController?.dialog.applySelectedVrmFile(file);
        },
        setVrmDragOver: (isDragOver: boolean): void => {
            currentController?.dialog.setVrmDragOver(isDragOver);
        },
        startApp: (): void => {
            currentController?.start();
        },
    };
}
