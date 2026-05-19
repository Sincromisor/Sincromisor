import type { ApplySettingsFn, SincroAppController } from "../../app/controller";

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
