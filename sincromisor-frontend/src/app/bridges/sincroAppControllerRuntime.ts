import { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import { TalkManager } from "../../features/conversation/talk/talkManager";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { DialogManager } from "../../features/dialog/model/dialogManager";
import { PopMessageService } from "../../features/dialog/model/popMessageService";
import type { SincroAppEvent } from "../controller/sincroAppTypes";
import { SincroController } from "../controller/sincroController";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./sincroAppBridges";
import { getSincroAppRightToolPanelService } from "./sincroAppRightToolPanelService";

/** アプリが使う下位サービスと、初期化処理・Reactへ公開する操作窓口。 */
export type SincroAppControllerRuntimeBundle = {
    coreController: SincroController;
    chatMessageService: ChatMessageService;
    debugConsoleManager: DebugConsoleManager;
    talkManager: TalkManager;
    popMessageService: PopMessageService;
    dialogManager: DialogManager;
    dialogBridge: SincroAppDialogBridge;
    chatBridge: SincroAppChatBridge;
    debugBridge: SincroAppDebugBridge;
    rtcBridge: SincroAppRtcBridge;
    stateBridge: SincroAppStateBridge;
};

/**
 * 下位サービスの取得と操作窓口の組み立てを一度に行う。
 * 状態取得とRTC停止は組み立て中に呼ばず、アプリの初期化完了後の操作まで保留する。
 * 購読の開始は呼び出し元が設定の初期値を確定してから行う。
 */
export function createSincroAppRuntimeBundle(params: {
    emitEvent: (event: SincroAppEvent) => void;
    stopRTC: () => void;
    state: SincroAppStateBridge;
}): SincroAppControllerRuntimeBundle {
    const coreController = new SincroController({ emitEvent: params.emitEvent });
    const chatMessageService = ChatMessageService.getService();
    const debugConsoleManager = DebugConsoleManager.getManager();
    const talkManager = TalkManager.getManager();
    const popMessageService = PopMessageService.getService();
    const dialogManager = DialogManager.getManager();
    const rightToolPanelService = getSincroAppRightToolPanelService();

    // 公開名へ対応付け、各サービスを呼び出し時のthisとして保持し、状態や副作用は各サービスに委ねる。
    return {
        coreController,
        chatMessageService,
        debugConsoleManager,
        talkManager,
        popMessageService,
        dialogManager,
        dialogBridge: {
            applySelectedVrmFile: (file) => dialogManager.applySelectedVrmFile(file),
            setVrmDragOver: (isDragOver) => dialogManager.setVrmDragOver(isDragOver),
            close: () => dialogManager.closeDialog(),
            open: () => dialogManager.showDialog(),
            updateUserMediaAvailabilityStatus: (available) =>
                dialogManager.updateUserMediaAvailabilityStatus(available),
            updateCharacterAvailabilityStatus: (available) =>
                dialogManager.updateCharacterStatus(available),
            isCharacterEnabled: () => dialogManager.getSetting("enableCharacter"),
            isVREnabled: () => dialogManager.getSetting("enableVR"),
            isInspectorEnabled: () => dialogManager.getSetting("enableInspector"),
            loadVrmThumbnailBlob: () => dialogManager.loadVrmThumbnailBlob(),
            saveVrmThumbnailBlob: async (blob) => {
                await dialogManager.saveVrmThumbnailBlob(blob);
            },
            getSelectedVrmUrl: () => dialogManager.getSelectedVrmUrl(),
        },
        chatBridge: {
            writeUnknownUserMessage: (message, isHTML) =>
                chatMessageService.writeUnknownUserMessage(message, isHTML),
            writeSystemMessage: (message, isHTML) =>
                chatMessageService.writeSystemMessage(message, isHTML),
            setSystemIcon: (iconUrl) => chatMessageService.setSystemIcon(iconUrl),
            getMessageViewSnapshot: () => chatMessageService.getMessageViewSnapshot(),
            getSystemIconUrl: () => chatMessageService.getSystemIconUrl(),
        },
        debugBridge: {
            setRTCStopButtonEventListener: (stopFunction) =>
                debugConsoleManager.setRTCStopButtonEventListener(stopFunction),
            getRightToolPanelState: () => rightToolPanelService.getState(),
            subscribeRightToolPanelState: (listener) => rightToolPanelService.subscribe(listener),
            openRightToolMenu: () => rightToolPanelService.openMenu(),
            closeRightToolMenu: () => rightToolPanelService.closeMenu(),
            toggleRightToolMenu: () => rightToolPanelService.toggleMenu(),
            showRightToolDebugPanel: () => rightToolPanelService.showDebugPanel(),
            hideRightToolDebugPanel: () => rightToolPanelService.hideDebugPanel(),
            toggleRightToolDebugPanel: () => rightToolPanelService.toggleDebugPanel(),
            showRightToolSettingsPanel: () => rightToolPanelService.showSettingsPanel(),
            hideRightToolSettingsPanel: () => rightToolPanelService.hideSettingsPanel(),
            toggleRightToolSettingsPanel: () => rightToolPanelService.toggleSettingsPanel(),
        },
        rtcBridge: { stop: params.stopRTC },
        stateBridge: params.state,
    };
}
