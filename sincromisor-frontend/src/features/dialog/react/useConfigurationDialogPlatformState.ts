import { useEffect, useRef } from "react";
import { DialogBridgeDomAdapter } from "../model/dialogBridgeDomAdapter";

type UseConfigurationDialogPlatformStateParams = {
    isOpen: boolean;
    onClosed: () => void;
};

// HTMLDialogElement の platform API を React component 側へ閉じ込める hook。
// 状態の正本は DialogManager/AppController に置き、ここは native dialog との同期だけを行う。
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
        // 初期選択で隠したファイル入力へ入らず、開始後も見える操作へ移す。
        const target = isOpen
            ? dialog.querySelector<HTMLElement>(
                  'input[type="radio"]:checked:not(:disabled), select:not(:disabled), button:not(:disabled)',
              )
            : document.getElementById("debugMenuButton");
        target?.focus({ preventScroll: true });
    }, [isOpen]);

    return {
        dialogRef,
    };
}
