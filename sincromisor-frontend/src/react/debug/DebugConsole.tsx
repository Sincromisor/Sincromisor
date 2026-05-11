import { useMemo, useState, useSyncExternalStore } from "react";
import { DebugConsoleManager, type DebugConsoleSnapshot } from "../../ts/UI/DebugConsoleManager";
import { DebugConsoleTabs } from "./DebugConsoleTabs";
import type { DebugTabKey } from "./debugConsoleTypes";
import { AudioPanel } from "./panels/AudioPanel";
import { GazePanel } from "./panels/GazePanel";
import { MessagesPanel } from "./panels/MessagesPanel";
import { RtcPanel } from "./panels/RtcPanel";
import { SdpPanel } from "./panels/SdpPanel";
import { SincroMotionPanel } from "./panels/SincroMotionPanel";
import { StatusPanel } from "./panels/StatusPanel";

function useDebugConsoleSnapshot(): DebugConsoleSnapshot {
    const manager = DebugConsoleManager.getManager();
    return useSyncExternalStore(
        (listener) => manager.subscribeSnapshot(listener),
        () => manager.getSnapshot(),
        () => manager.getSnapshot(),
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
                <AudioPanel snapshot={snapshot} manager={manager} isActive={activeTab === "audio"} />
                <RtcPanel snapshot={snapshot} isActive={activeTab === "rtc"} />
                <MessagesPanel snapshot={snapshot} isActive={activeTab === "messages"} />
                <GazePanel snapshot={snapshot} manager={manager} isActive={activeTab === "gaze"} />
                <SincroMotionPanel snapshot={snapshot} isActive={activeTab === "sincro"} />
                <SdpPanel snapshot={snapshot} isActive={activeTab === "sdp"} />
            </div>
        </div>
    );
}
