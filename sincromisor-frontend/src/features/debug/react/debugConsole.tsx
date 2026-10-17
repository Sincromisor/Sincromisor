import { Activity, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DebugConsoleManager, type DebugConsoleSnapshot } from "../model/debugConsoleManager";
import { DebugConsoleTabs } from "./debugConsoleTabs";
import type { DebugTabKey } from "./debugConsoleTypes";
import { AudioPanel } from "./panels/audioPanel";
import { GazeDetails, GazePanel } from "./panels/gazePanel";
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

/** 枠・タブ選択・映像・音声は常設し、非表示時はActivity内の診断購読だけを休止する。 */
export function DebugConsole({ isVisible = true }: { isVisible?: boolean }) {
    const [activeTab, setActiveTab] = useState<DebugTabKey>("status");
    const [gazeDetailsRoot, setGazeDetailsRoot] = useState<HTMLDivElement | null>(null);
    const manager = debugConsoleManager;

    return (
        <div id="debugConsole">
            <header className="debugConsoleHeader">
                <div className="debugConsoleTitleBox">
                    <h2>開発者ツール</h2>
                </div>
                <div className="debugConsoleHeaderActions">
                    <div className="debugConsoleActions">
                        <button id="rtcStop" type="button" onClick={() => manager.requestRtcStop()}>
                            接続を停止
                        </button>
                    </div>
                </div>
            </header>
            <DebugConsoleTabs activeTab={activeTab} onSelect={setActiveTab} />
            <div className="debugConsolePanelSlot">
                <GazePanel isActive={activeTab === "gaze"} detailsRef={setGazeDetailsRoot} />
                <Activity mode={isVisible ? "visible" : "hidden"}>
                    <DebugConsolePanels activeTab={activeTab} gazeDetailsRoot={gazeDetailsRoot} />
                </Activity>
                {/* biome-ignore lint/a11y/useMediaCaption: RTCの受信音声出力であり、字幕トラックは存在しない。 */}
                <audio id="rtcAudio" autoPlay={true}></audio>
            </div>
        </div>
    );
}

/** スナップショット購読を所有する表示部分。portal先の常設DOMの生存期間は変更しない。 */
function DebugConsolePanels({
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
