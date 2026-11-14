import { useEffect, useRef } from "react";
import { DialogBridgeDomAdapter } from "../model/dialogBridgeDomAdapter";

type UseConfigurationDialogPlatformStateParams = {
    isOpen: boolean;
    onClosed: () => void;
};

/** DialogManagerの開閉状態を標準dialogへ同期し、開始前後のフォーカスを移す。 */
export function useConfigurationDialogPlatformState(
    params: UseConfigurationDialogPlatformStateParams,
) {
    const { isOpen, onClosed } = params;
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const adapterRef = useRef<DialogBridgeDomAdapter | undefined>(undefined);

    if (adapterRef.current === undefined) {
        adapterRef.current = new DialogBridgeDomAdapter();
    }

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) {
            return;
        }
        return adapterRef.current?.bindDialogCloseInteractions(dialog, onClosed);
    }, [onClosed]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) {
            return;
        }
        const changed = adapterRef.current?.syncDialogOpenState(dialog, isOpen);
        if (!changed) return;
        // 開始前はヘッダーの補助操作より選択中の体験を優先し、開始後は常設メニューへ戻す。
        const target = isOpen
            ? (dialog.querySelector<HTMLElement>('input[type="radio"]:checked:not(:disabled)') ??
              dialog.querySelector<HTMLElement>("select:not(:disabled), button:not(:disabled)"))
            : document.getElementById("debugMenuButton");
        target?.focus({ preventScroll: true });
    }, [isOpen]);

    return {
        dialogRef,
    };
}
