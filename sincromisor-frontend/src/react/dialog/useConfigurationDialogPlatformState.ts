import { useEffect, useRef } from "react";
import { DialogBridgeDomAdapter } from "../../ts/ui/dialogBridgeDomAdapter";

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
        adapterRef.current?.syncDialogOpenState(dialog, isOpen);
    }, [isOpen]);

    return {
        dialogRef,
    };
}
