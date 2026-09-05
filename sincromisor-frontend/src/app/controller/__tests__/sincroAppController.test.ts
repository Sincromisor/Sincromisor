import { expect, it, vi } from "vitest";
import type { ChatMessageServiceEvent } from "../../../features/conversation/chat/model/chatMessageService";
import type { TalkManagerEvent } from "../../../features/conversation/talk/talkManager";
import type { DebugConsoleManagerEvent } from "../../../features/debug/model/debugConsoleManager";
import { DialogEventHub } from "../../../features/dialog/model/dialogEventHub";
import { DialogStateStore } from "../../../features/dialog/model/dialogStateStore";
import type { DialogPopEvent } from "../../../features/dialog/model/popMessageService";
import { subscribeActiveSincroAppEvents } from "../../react/subscribeActiveSincroAppEvents";
import {
    createDefaultSincroAppSettingsUiState,
    defaultSincroAppSettingsUiHints,
} from "../../settings/sincroAppSettingsDefaults";
import { SincroAppController } from "../sincroAppController";
import { subscribeActiveSincroAppController } from "../subscribeActiveSincroAppController";

const { createRuntime } = vi.hoisted(() => ({ createRuntime: vi.fn() }));
// 機器や描画の起動だけを置き換え、制御処理・購読登録・React向け購読は実装を通す。
vi.mock("../../bridges/sincroAppControllerRuntime", () => ({
    createSincroAppRuntimeBundle: createRuntime,
}));
vi.mock("../sincroController", () => ({ SincroController: vi.fn() }));

/** 共有サービスの通知先数と解除回数を観測する。 */
function createNotifications<T>() {
    const listeners = new Set<(event: T) => void>();
    const release = vi.fn((listener: (event: T) => void) => listeners.delete(listener));
    return {
        listeners,
        release,
        subscribe: (listener: (event: T) => void) => {
            // 差し替えでは、新登録の前に旧登録が消えている必要がある。
            expect(listeners.size).toBe(0);
            listeners.add(listener);
            return () => release(listener);
        },
        emit: (event: T) => {
            for (const listener of listeners) listener(event);
        },
    };
}

it("差し替えで旧外部購読を解除し、Reactの初期同期とRTC停止後の設定通知を維持する", () => {
    vi.stubGlobal("window", new EventTarget());
    const chat = createNotifications<ChatMessageServiceEvent>();
    const debug = createNotifications<DebugConsoleManagerEvent>();
    const talk = createNotifications<TalkManagerEvent>();
    const pop = createNotifications<DialogPopEvent>();
    const dialogEvents = new DialogEventHub();
    const dialogState = new DialogStateStore();
    const openDialogs: ReturnType<typeof vi.fn>[] = [];
    const stopRTC = vi.fn();
    createRuntime.mockImplementation(() => {
        const open = vi.fn();
        openDialogs.push(open);
        return {
            coreController: { start: vi.fn(), stopRTC },
            chatMessageService: chat,
            debugConsoleManager: debug,
            talkManager: talk,
            popMessageService: { subscribeDialogPop: pop.subscribe },
            dialogManager: {
                getSettings: () => dialogState.getSettings(),
                settingsUiState: createDefaultSincroAppSettingsUiState,
                settingsUiHints: () => defaultSincroAppSettingsUiHints,
                getDialogUiState: () => dialogState.getDialogUiState(),
                getVrmUiState: () => dialogState.getDialogVrmUiState(),
                subscribeSettingsChange: dialogEvents.subscribeSettingsChange.bind(dialogEvents),
                subscribeDialogUiState: (
                    listener: Parameters<DialogEventHub["subscribeDialogUiState"]>[0],
                ) => dialogEvents.subscribeDialogUiState(listener, dialogState.getDialogUiState()),
                subscribeVrmUiState: (
                    listener: Parameters<DialogEventHub["subscribeVrmUiState"]>[0],
                ) => dialogEvents.subscribeVrmUiState(listener, dialogState.getDialogVrmUiState()),
            },
            dialogBridge: { open },
        };
    });
    const old = new SincroAppController();
    const oldEvents = vi.fn();
    const unsubscribeOld = old.subscribe(oldEvents);
    const reactEvents = vi.fn();
    const unsubscribeReact = subscribeActiveSincroAppEvents({ onEvent: reactEvents });
    const settingsSeen = vi.fn();
    const unsubscribeSettings = subscribeActiveSincroAppController((controller) => {
        if (!controller) return;
        const read = () => settingsSeen(controller.settingsStore.getSnapshot());
        read();
        return controller.settingsStore.subscribe(read);
    });
    let current: SincroAppController | undefined;
    try {
        expect(reactEvents).toHaveBeenCalledWith(
            expect.objectContaining({ type: "lifecycle", state: "idle" }),
            old,
        );
        dialogState.set("titleText", "差し替え前の設定");
        oldEvents.mockClear();
        reactEvents.mockClear();
        current = new SincroAppController();
        expect(reactEvents).toHaveBeenCalledWith(
            expect.objectContaining({ type: "lifecycle", state: "idle" }),
            current,
        );
        expect(settingsSeen).toHaveBeenLastCalledWith(
            expect.objectContaining({
                settings: expect.objectContaining({ titleText: "差し替え前の設定" }),
            }),
        );
        // 再解除しても新購読を消さず、共有サービスの解除関数も再実行しない。
        old.releaseEventSubscriptions();
        old.releaseEventSubscriptions();
        for (const source of [chat, debug, talk, pop]) {
            expect(source.listeners.size).toBe(1);
            expect(source.release).toHaveBeenCalledTimes(1);
        }
        reactEvents.mockClear();
        debug.emit({ type: "local_vad_state", isSpeech: true });
        expect(reactEvents).toHaveBeenCalledExactlyOnceWith(
            { type: "local_vad_state", isSpeech: true },
            current,
        );
        window.dispatchEvent(new Event("sincro:open-configuration-dialog"));
        expect(openDialogs[0]).not.toHaveBeenCalled();
        expect(openDialogs[1]).toHaveBeenCalledOnce();
        dialogEvents.emitDialogUiStateChanged(dialogState.getDialogUiState());
        dialogEvents.emitVrmUiStateChanged(dialogState.getDialogVrmUiState());
        current.start();
        current.stopRTC();
        expect(stopRTC).toHaveBeenCalledOnce();
        settingsSeen.mockClear();
        dialogState.set("titleText", "RTC停止後の設定");
        dialogEvents.emitSettingsChanged();
        expect(settingsSeen).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                settings: expect.objectContaining({ titleText: "RTC停止後の設定" }),
            }),
        );
        expect(oldEvents).not.toHaveBeenCalled();
        current.releaseEventSubscriptions();
        current.releaseEventSubscriptions();
        for (const source of [chat, debug, talk, pop]) {
            expect(source.listeners.size).toBe(0);
            expect(source.release).toHaveBeenCalledTimes(2);
        }
        reactEvents.mockClear();
        window.dispatchEvent(new Event("sincro:looking-glass-polyfill-reinit-ready"));
        expect(reactEvents).not.toHaveBeenCalled();
    } finally {
        unsubscribeReact();
        unsubscribeSettings();
        unsubscribeOld();
        old.releaseEventSubscriptions();
        current?.releaseEventSubscriptions();
        vi.unstubAllGlobals();
    }
});
