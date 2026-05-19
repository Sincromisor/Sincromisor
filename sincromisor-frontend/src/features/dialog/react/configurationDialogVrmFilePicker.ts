import type { ChangeEvent, RefObject } from "react";
import { useRef } from "react";

type ConfigurationDialogVrmFilePickerOptions = {
    applySelectedVrmFile: (file: File) => void;
};

type ConfigurationDialogVrmFilePicker = {
    vrmFileInputRef: RefObject<HTMLInputElement | null>;
    handleOpenVrmFilePicker: () => void;
    handleVrmFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function useConfigurationDialogVrmFilePicker({
    applySelectedVrmFile,
}: ConfigurationDialogVrmFilePickerOptions): ConfigurationDialogVrmFilePicker {
    const vrmFileInputRef = useRef<HTMLInputElement | null>(null);

    const handleOpenVrmFilePicker = (): void => {
        const input = vrmFileInputRef.current;
        if (!input) {
            return;
        }
        // 同じファイルを選び直した時も change が発火するよう、click 前に値を空に戻す。
        input.value = "";
        input.click();
    };

    const handleVrmFileInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.currentTarget.files?.[0];
        if (!file) {
            return;
        }
        applySelectedVrmFile(file);
        event.currentTarget.value = "";
    };

    return {
        vrmFileInputRef,
        handleOpenVrmFilePicker,
        handleVrmFileInputChange,
    };
}
