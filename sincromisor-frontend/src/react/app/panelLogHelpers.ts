import type { SincroAppEvent } from "../../ts/app/sincroAppTypes";
import type { PanelMessageLog } from "../simpleVrm/panelTypes";
import { UI_TUNING } from "./uiTuning";

type ChatLikeEvent = Extract<
    SincroAppEvent,
    { type: "chat_message" | "system_message" | "error_message" }
>;

// 配列先頭に要素を追加し、件数上限を維持する共通 helper。
// chat log 以外（dialog pop 等）の一時リストにも使えるよう汎用化している。
export function prependCappedItem<T>(prev: T[], item: T, limit: number): T[] {
    return [item, ...prev].slice(0, limit);
}

// Control Panel 系 hook で共通に使う「メッセージログの先頭追加 + 件数制限」処理。
export function prependPanelMessageLog(
    prev: PanelMessageLog[],
    event: ChatLikeEvent,
    limit = UI_TUNING.controlPanel.chatLogLimit,
): PanelMessageLog[] {
    return prependCappedItem(prev, { kind: event.type, text: event.message.message }, limit);
}
