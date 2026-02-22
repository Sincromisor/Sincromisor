import { useEffect, useState } from "react";
import type { SincroAppDialogPopMessage, SincroAppEvent } from "../../ts/App/SincroAppTypes";
import { subscribeActiveSincroAppController } from "../app/subscribeActiveSincroAppController";
import { prependCappedItem } from "../app/panelLogHelpers";
import { DIALOG_POP_TIMING, scheduleDialogPopVisibility } from "./dialogPopAnimationHelpers";
import { useDialogPopTimers } from "./useDialogPopTimers";
import { UI_TUNING } from "../app/uiTuning";

type DialogPopItem = SincroAppDialogPopMessage & {
    visible: boolean;
};

// dialog 内の Pop 通知を React で描画する。既存 CSS (`.popMessage`, `.showPop`, `.popError`) を再利用する。
export function DialogPopMessages() {
    const [items, setItems] = useState<DialogPopItem[]>([]);
    const { register, clearAll } = useDialogPopTimers();

    useEffect(() => {
        const unsubscribe = subscribeActiveSincroAppController((controller) => {
            if (!controller) {
                return;
            }
            controller.dialog.setPopDomRenderingEnabled(false);

            const unsubscribeController = controller.subscribe((event: SincroAppEvent) => {
                if (event.type !== "dialog_pop_message") {
                    return;
                }
                const dialogPop = event.message;
                const nextItem: DialogPopItem = { ...dialogPop, visible: false };
                setItems((prev) => prependCappedItem(prev, nextItem, DIALOG_POP_TIMING.renderLimit));
                const cleanupTimer = scheduleDialogPopVisibility(nextItem, setItems);
                register(
                    cleanupTimer,
                    nextItem.autoRemoveMs + DIALOG_POP_TIMING.hideTransitionMs + UI_TUNING.dialogPop.cleanupMarginMs,
                );
            });

            return () => {
                clearAll();
                unsubscribeController();
                controller.dialog.setPopDomRenderingEnabled(true);
            };
        });

        return () => {
            clearAll();
            unsubscribe();
        };
    }, [register, clearAll]);

    return (
        <>
            {items.map((item) => (
                <div
                    key={item.id}
                    className={`popMessage${item.error ? " popError" : ""}${item.visible ? " showPop" : ""}`}
                >
                    {item.message}
                </div>
            ))}
        </>
    );
}
