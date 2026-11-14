import { Activity, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DebugConsoleManager, type DebugConsoleSnapshot } from "../model/debugConsoleManager";
import type { DebugTabKey } from "./debugConsoleTypes";
import { AudioPanel } from "./panels/audioPanel";
import { GazeDetails } from "./panels/gazeDetails";
import { MessagesPanel } from "./panels/messagesPanel";
import { RtcPanel } from "./panels/rtcPanel";
import { SdpPanel } from "./panels/sdpPanel";
import { SincroMotionPanel } from "./panels/sincroMotionPanel";
import { StatusPanel } from "./panels/statusPanel";

// 管理処理はページ内で共有し、描画のたびに購読関数を作り直さない。
const debugConsoleManager = DebugConsoleManager.getManager();

function subscribeDebugConsoleSnapshot(listener: () => void): () => void {
    return debugConsoleManager.subscribeSnapshot(listener);
}

function getDebugConsoleSnapshot(): DebugConsoleSnapshot {
    return debugConsoleManager.getSnapshot();
}

/** 診断の表示期間だけ最新スナップショットを購読する。 */
function useDebugConsoleSnapshot(): DebugConsoleSnapshot {
    return useSyncExternalStore(
        subscribeDebugConsoleSnapshot,
        getDebugConsoleSnapshot,
        getDebugConsoleSnapshot,
    );
}

/** スナップショット購読を所有する表示部分。portal先の常設DOMの生存期間は変更しない。 */
export function DebugConsolePanels({
    activeTab,
    gazeDetailsRoot,
}: {
    activeTab: DebugTabKey;
    gazeDetailsRoot: HTMLDivElement | null;
}) {
    const snapshot = useDebugConsoleSnapshot();
    const manager = debugConsoleManager;
    return (
        <>
            <Activity mode={activeTab === "status" ? "visible" : "hidden"}>
                <StatusPanel snapshot={snapshot} isActive={activeTab === "status"} />
            </Activity>
            <Activity mode={activeTab === "audio" ? "visible" : "hidden"}>
                <AudioPanel
                    snapshot={snapshot}
                    manager={manager}
                    isActive={activeTab === "audio"}
                />
            </Activity>
            <Activity mode={activeTab === "rtc" ? "visible" : "hidden"}>
                <RtcPanel snapshot={snapshot} isActive={activeTab === "rtc"} />
            </Activity>
            <Activity mode={activeTab === "messages" ? "visible" : "hidden"}>
                <MessagesPanel snapshot={snapshot} isActive={activeTab === "messages"} />
            </Activity>
            <Activity mode={activeTab === "gaze" ? "visible" : "hidden"}>
                {gazeDetailsRoot &&
                    createPortal(
                        <GazeDetails snapshot={snapshot} manager={manager} />,
                        gazeDetailsRoot,
                    )}
            </Activity>
            <Activity mode={activeTab === "sincro" ? "visible" : "hidden"}>
                <SincroMotionPanel
                    snapshot={snapshot}
                    manager={manager}
                    isActive={activeTab === "sincro"}
                />
            </Activity>
            <Activity mode={activeTab === "sdp" ? "visible" : "hidden"}>
                <SdpPanel snapshot={snapshot} isActive={activeTab === "sdp"} />
            </Activity>
        </>
    );
}
