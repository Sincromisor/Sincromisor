import { UI_TUNING } from "../app/uiTuning";

type DialogPopItemLike = {
    id: number;
    visible: boolean;
    autoRemoveMs: number;
};

type SetItems<T extends DialogPopItemLike> = (updater: (prev: T[]) => T[]) => void;
type TimeoutHandle = ReturnType<typeof setTimeout>;
const DIALOG_POP_RENDER_LIMIT = UI_TUNING.dialogPop.renderLimit;
const DIALOG_POP_SHOW_DELAY_MS = UI_TUNING.dialogPop.showDelayMs;
const DIALOG_POP_HIDE_TRANSITION_MS = UI_TUNING.dialogPop.hideTransitionMs;
// dialog pop の件数/タイミングは UI_TUNING に寄せ、調整箇所をこの helper から分散させない。

// dialog pop の表示/非表示/削除タイマーを共通化する helper。
// React component 側は「新規 item を追加した後に、この helper を呼ぶ」だけにして可読性を保つ。
export function scheduleDialogPopVisibility<T extends DialogPopItemLike>(
    item: T,
    setItems: SetItems<T>,
): () => void {
    // CSS transition を使うため、次フレーム相当で visible=true にする。
    const showTimer: TimeoutHandle = setTimeout(() => {
        setItems((prev) =>
            prev.map((prevItem) =>
                prevItem.id === item.id ? { ...prevItem, visible: true } : prevItem,
            ),
        );
    }, DIALOG_POP_SHOW_DELAY_MS);

    // PopMessageService 既存挙動に合わせて、自動で hide -> remove を行う。
    let removeTimer: TimeoutHandle | undefined;
    const hideTimer: TimeoutHandle = setTimeout(() => {
        setItems((prev) =>
            prev.map((prevItem) =>
                prevItem.id === item.id ? { ...prevItem, visible: false } : prevItem,
            ),
        );
        removeTimer = setTimeout(() => {
            setItems((prev) => prev.filter((prevItem) => prevItem.id !== item.id));
        }, DIALOG_POP_HIDE_TRANSITION_MS);
    }, item.autoRemoveMs);

    return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        if (removeTimer !== undefined) {
            clearTimeout(removeTimer);
        }
    };
}

export const DIALOG_POP_TIMING = {
    renderLimit: DIALOG_POP_RENDER_LIMIT,
    showDelayMs: DIALOG_POP_SHOW_DELAY_MS,
    hideTransitionMs: DIALOG_POP_HIDE_TRANSITION_MS,
} as const;
