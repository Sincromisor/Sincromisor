import { useMemo, useState, useSyncExternalStore } from "react";
import { DebugConsoleManager, type DebugConsoleSnapshot } from "../model/debugConsoleManager";
import { DebugConsoleTabs } from "./debugConsoleTabs";
import type { DebugTabKey } from "./debugConsoleTypes";
import { AudioPanel } from "./panels/audioPanel";
import { GazePanel } from "./panels/gazePanel";
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

// Debug Console は snapshot 購読と panel 選択だけを持つ。
// 個別の診断表示や tuning 操作は panels 側へ分け、巨大な JSX への再集中を防ぐ。
export function DebugConsole() {
    const snapshot = useDebugConsoleSnapshot();
    const [activeTab, setActiveTab] = useState<DebugTabKey>("status");
    const manager = useMemo(() => DebugConsoleManager.getManager(), []);

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
                <StatusPanel snapshot={snapshot} isActive={activeTab === "status"} />
                <AudioPanel
                    snapshot={snapshot}
                    manager={manager}
                    isActive={activeTab === "audio"}
                />
                <RtcPanel snapshot={snapshot} isActive={activeTab === "rtc"} />
                <MessagesPanel snapshot={snapshot} isActive={activeTab === "messages"} />
                <GazePanel snapshot={snapshot} manager={manager} isActive={activeTab === "gaze"} />
                <SincroMotionPanel
                    snapshot={snapshot}
                    manager={manager}
                    isActive={activeTab === "sincro"}
                />
                <SdpPanel snapshot={snapshot} isActive={activeTab === "sdp"} />
            </div>
        </div>
    );
}
