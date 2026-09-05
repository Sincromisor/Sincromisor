import { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import { TalkManager } from "../../features/conversation/talk/talkManager";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { DialogManager } from "../../features/dialog/model/dialogManager";
import { PopMessageService } from "../../features/dialog/model/popMessageService";
import { SincroController } from "../controller/sincroController";
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
export function createSincroAppUiDependencyBundle(params: {
    emitEvent: (event: import("../controller/sincroAppTypes").SincroAppEvent) => void;
}): SincroAppUiDependencyBundle {
    return {
        coreController: new SincroController({ emitEvent: params.emitEvent }),
        chatMessageService: ChatMessageService.getService(),
        debugConsoleManager: DebugConsoleManager.getManager(),
        talkManager: TalkManager.getManager(),
        popMessageService: PopMessageService.getService(),
        dialogManager: DialogManager.getManager(),
    };
}

/** UI用の依存から操作窓口を作る。テロップ履歴は状態窓口から読み取る。 */
export function createSincroAppBridgeBundle(
    uiDependencies: Pick<
        SincroAppUiDependencyBundle,
        "chatMessageService" | "debugConsoleManager" | "dialogManager"
    >,
    callbacks: { stopRTC: () => void },
): SincroAppBridgeBundle {
    return {
        dialogBridge: createSincroAppDialogBridge({
            dialogManager: uiDependencies.dialogManager,
        }),
        chatBridge: createSincroAppChatBridge(uiDependencies.chatMessageService),
        debugBridge: createSincroAppDebugBridge(uiDependencies.debugConsoleManager),
        rtcBridge: createSincroAppRtcBridge({ stopRTC: callbacks.stopRTC }),
    };
}

/** 下位サービスと操作窓口を組み立てる。設定の購読状態は組み立て後にアプリ制御が保持する。 */
export function createSincroAppRuntimeBundle(params: {
    emitEvent: (event: import("../controller/sincroAppTypes").SincroAppEvent) => void;
    stopRTC: () => void;
    getSettingsSnapshot: () => import("../controller/sincroAppTypes").SincroAppSettingsSnapshot;
    getDialogUiState: () => import("../controller/sincroAppTypes").SincroAppDialogUiState;
    getDialogVrmUiState: () => import("../controller/sincroAppTypes").SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => import("../controller/sincroAppTypes").SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("../controller/sincroAppTypes").TelopTextSegment[];
}): SincroAppControllerRuntimeBundle {
    // UI 依存取得 -> bridge 生成 -> state bridge 生成を1か所にまとめる。
    // Controller 本体では field 代入と bind 順序だけを読めるようにする。
    const uiDependencies = createSincroAppUiDependencyBundle({ emitEvent: params.emitEvent });
    const bridges = createSincroAppBridgeBundle(uiDependencies, { stopRTC: params.stopRTC });
    const stateBridge = createSincroAppStateBridge({
        getSettingsSnapshot: params.getSettingsSnapshot,
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
