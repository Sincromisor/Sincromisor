import { SincroController } from "../SincroController";
import { ChatMessageManager } from "../UI/ChatMessageManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { DialogManager } from "../UI/DialogManager";
import { PopManager } from "../UI/PopManager";
import { TalkManager } from "../RTC/TalkManager";
import {
    createSincroAppChatBridge,
    createSincroAppDebugBridge,
    createSincroAppDialogBridge,
    createSincroAppRtcBridge,
    createSincroAppStateBridge,
} from "./SincroAppBridgeFactories";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./SincroAppBridges";

// SincroAppController constructor の依存組み立てを helper 側へ逃がすための bundle 型。
export type SincroAppManagerBundle = {
    coreController: SincroController;
    chatMessageManager: ChatMessageManager;
    debugConsoleManager: DebugConsoleManager;
    talkManager: TalkManager;
    popManager: PopManager;
    dialogManager: DialogManager;
};

export type SincroAppBridgeBundle = {
    dialogBridge: SincroAppDialogBridge;
    chatBridge: SincroAppChatBridge;
    debugBridge: SincroAppDebugBridge;
    rtcBridge: SincroAppRtcBridge;
};

export type SincroAppControllerRuntimeBundle = SincroAppManagerBundle & SincroAppBridgeBundle & {
    stateBridge: SincroAppStateBridge;
};

// SincroAppController constructor から singleton 取得列挙を分離し、初期化ブロックの見通しを良くする。
export function createSincroAppManagerBundle(): SincroAppManagerBundle {
    return {
        coreController: new SincroController(),
        chatMessageManager: ChatMessageManager.getManager(),
        debugConsoleManager: DebugConsoleManager.getManager(),
        talkManager: TalkManager.getManager(),
        popManager: PopManager.getManager(),
        dialogManager: DialogManager.getManager(),
    };
}

// manager bundle を元に bridge 群をまとめて作成する helper。
export function createSincroAppBridgeBundle(
    managers: Pick<SincroAppManagerBundle, "chatMessageManager" | "debugConsoleManager" | "dialogManager" | "popManager" | "talkManager">,
    callbacks: { stopRTC: () => void; },
): SincroAppBridgeBundle {
    return {
        dialogBridge: createSincroAppDialogBridge({
            dialogManager: managers.dialogManager,
            popManager: managers.popManager,
        }),
        chatBridge: createSincroAppChatBridge(managers.chatMessageManager, managers.talkManager),
        debugBridge: createSincroAppDebugBridge(managers.debugConsoleManager),
        rtcBridge: createSincroAppRtcBridge({ stopRTC: callbacks.stopRTC }),
    };
}

export function createSincroAppRuntimeBundle(params: {
    stopRTC: () => void;
    getSettingsSnapshot: () => import("./SincroAppTypes").SincroAppSettingsSnapshot;
    getSettingsUiState: () => import("./SincroAppTypes").SincroAppSettingsUiState;
    getSettingsUiHints: () => import("./SincroAppTypes").SincroAppSettingsUiHints;
    getDialogUiState: () => import("./SincroAppTypes").SincroAppDialogUiState;
    getDialogVrmUiState: () => import("./SincroAppTypes").SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => import("./SincroAppTypes").SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("./SincroAppTypes").TelopTextSegment[];
}): SincroAppControllerRuntimeBundle {
    // manager 取得 -> bridge 生成 -> state bridge 生成を1か所にまとめる。
    // Controller 本体では field 代入と bind 順序だけを読めるようにする。
    const managers = createSincroAppManagerBundle();
    const bridges = createSincroAppBridgeBundle(managers, { stopRTC: params.stopRTC });
    const stateBridge = createSincroAppStateBridge({
        getSettingsSnapshot: params.getSettingsSnapshot,
        getSettingsUiState: params.getSettingsUiState,
        getSettingsUiHints: params.getSettingsUiHints,
        getDialogUiState: params.getDialogUiState,
        getDialogVrmUiState: params.getDialogVrmUiState,
        getStartupSettingsStatus: params.getStartupSettingsStatus,
        getTelopTextSegmentsSnapshot: params.getTelopTextSegmentsSnapshot,
    });
    return {
        ...managers,
        ...bridges,
        stateBridge,
    };
}
