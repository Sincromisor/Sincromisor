import { TalkManager } from "../rtc/talkManager";
import { SincroController } from "../sincroController";
import { ChatMessageService } from "../ui/chatMessageService";
import { DebugConsoleManager } from "../ui/debugConsoleManager";
import { DialogManager } from "../ui/dialogManager";
import { PopMessageService } from "../ui/popMessageService";
import {
    createSincroAppChatBridge,
    createSincroAppDebugBridge,
    createSincroAppDialogBridge,
    createSincroAppRtcBridge,
    createSincroAppStateBridge,
} from "./sincroAppBridgeFactories";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./sincroAppBridges";

// SincroAppController constructor の UI 依存組み立てを helper 側へ逃がすための bundle 型。
export type SincroAppUiDependencyBundle = {
    coreController: SincroController;
    chatMessageService: ChatMessageService;
    debugConsoleManager: DebugConsoleManager;
    talkManager: TalkManager;
    popMessageService: PopMessageService;
    dialogManager: DialogManager;
};

export type SincroAppBridgeBundle = {
    dialogBridge: SincroAppDialogBridge;
    chatBridge: SincroAppChatBridge;
    debugBridge: SincroAppDebugBridge;
    rtcBridge: SincroAppRtcBridge;
};

export type SincroAppControllerRuntimeBundle = SincroAppUiDependencyBundle &
    SincroAppBridgeBundle & {
        stateBridge: SincroAppStateBridge;
    };

// SincroAppController constructor から UI 依存の singleton / service 取得列挙を分離し、初期化ブロックの見通しを良くする。
export function createSincroAppUiDependencyBundle(): SincroAppUiDependencyBundle {
    return {
        coreController: new SincroController(),
        chatMessageService: ChatMessageService.getService(),
        debugConsoleManager: DebugConsoleManager.getManager(),
        talkManager: TalkManager.getManager(),
        popMessageService: PopMessageService.getService(),
        dialogManager: DialogManager.getManager(),
    };
}

// UI dependency bundle を元に bridge 群をまとめて作成する helper。
export function createSincroAppBridgeBundle(
    uiDependencies: Pick<
        SincroAppUiDependencyBundle,
        "chatMessageService" | "debugConsoleManager" | "dialogManager" | "talkManager"
    >,
    callbacks: { stopRTC: () => void },
): SincroAppBridgeBundle {
    return {
        dialogBridge: createSincroAppDialogBridge({
            dialogManager: uiDependencies.dialogManager,
        }),
        chatBridge: createSincroAppChatBridge(
            uiDependencies.chatMessageService,
            uiDependencies.talkManager,
        ),
        debugBridge: createSincroAppDebugBridge(uiDependencies.debugConsoleManager),
        rtcBridge: createSincroAppRtcBridge({ stopRTC: callbacks.stopRTC }),
    };
}

export function createSincroAppRuntimeBundle(params: {
    stopRTC: () => void;
    getSettingsSnapshot: () => import("./sincroAppTypes").SincroAppSettingsSnapshot;
    getSettingsUiState: () => import("./sincroAppTypes").SincroAppSettingsUiState;
    getSettingsUiHints: () => import("./sincroAppTypes").SincroAppSettingsUiHints;
    getDialogUiState: () => import("./sincroAppTypes").SincroAppDialogUiState;
    getDialogVrmUiState: () => import("./sincroAppTypes").SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => import("./sincroAppTypes").SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("./sincroAppTypes").TelopTextSegment[];
}): SincroAppControllerRuntimeBundle {
    // UI 依存取得 -> bridge 生成 -> state bridge 生成を1か所にまとめる。
    // Controller 本体では field 代入と bind 順序だけを読めるようにする。
    const uiDependencies = createSincroAppUiDependencyBundle();
    const bridges = createSincroAppBridgeBundle(uiDependencies, { stopRTC: params.stopRTC });
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
        ...uiDependencies,
        ...bridges,
        stateBridge,
    };
}
