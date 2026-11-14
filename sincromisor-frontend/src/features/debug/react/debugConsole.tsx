import { Activity, lazy, Suspense, useEffect, useState } from "react";
import { DebugConsoleManager } from "../model/debugConsoleManager";
import { DebugConsoleErrorBoundary } from "./debugConsoleErrorBoundary";
import { DebugConsoleTabs } from "./debugConsoleTabs";
import type { DebugTabKey } from "./debugConsoleTypes";
import { GazePanel } from "./panels/gazePanel";

// 初回表示で一度だけ読み込み、開閉でコンポーネントや入力状態を作り直さない。
const LazyDebugConsolePanels = lazy(() =>
    import("./debugConsolePanels").then((module) => ({ default: module.DebugConsolePanels })),
);

/** 音声・追跡DOMを常設し、詳細表示は初回表示後だけ保持する。非表示時の購読はActivityが休止する。 */
export function DebugConsole({ isVisible = true }: { isVisible?: boolean }) {
    const [activeTab, setActiveTab] = useState<DebugTabKey>("status");
    const [gazeDetailsRoot, setGazeDetailsRoot] = useState<HTMLDivElement | null>(null);
    const manager = DebugConsoleManager.getManager();
    const [hasOpened, setHasOpened] = useState(isVisible);
    useEffect(() => {
        if (isVisible) setHasOpened(true);
    }, [isVisible]);

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
                {/* 非表示のActivityも子を評価するため、最初に開くまでは遅延境界を置かない。 */}
                {hasOpened && (
                    <Activity mode={isVisible ? "visible" : "hidden"}>
                        <DebugConsoleErrorBoundary>
                            <Suspense fallback={<p role="status">診断表示を読み込んでいます。</p>}>
                                <LazyDebugConsolePanels
                                    activeTab={activeTab}
                                    gazeDetailsRoot={gazeDetailsRoot}
                                />
                            </Suspense>
                        </DebugConsoleErrorBoundary>
                    </Activity>
                )}
                {/* biome-ignore lint/a11y/useMediaCaption: RTCの受信音声出力であり、字幕トラックは存在しない。 */}
                <audio id="rtcAudio" autoPlay={true}></audio>
            </div>
        </div>
    );
}
