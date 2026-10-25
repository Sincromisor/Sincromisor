import { type ReactElement, useEffect, useLayoutEffect, useRef } from "react";
import { ChatAnnouncer } from "../../features/conversation/chat/react/chatAnnouncer";
import { ConversationHistoryView } from "../../features/conversation/chat/react/conversationHistoryView";
import { SincroChatView } from "../../features/conversation/chat/react/sincroChatView";
import { SincroTelopView } from "../../features/conversation/telop/react/sincroTelopView";
import { DebugConsole } from "../../features/debug/react/debugConsole";
import { RightToolMenu } from "../../features/debug/react/rightToolMenu";
import { ConfigurationDialog } from "../../features/dialog/react/configurationDialog";
import type { SincroVRMRoots } from "../bootstrap/sincroVrmInitializer";
import {
    hideRightToolDebugPanel,
    hideRightToolHistoryPanel,
    hideRightToolSettingsPanel,
    useRightToolPanelState,
} from "../react/useRightToolPanelState";
import { useSincroAppControllerSettingsState } from "../react/useSincroAppControllerSettingsState";
import { RightToolFrame } from "./react/overlay/rightToolFrame";

type SincroPageAppShellProps = {
    controlPanel: ReactElement;
    onCharacterMounted: (roots: SincroVRMRoots) => void;
};

// modern 系ページで共通利用する app shell。
// React が UI 骨格と island 間の配置を一括で所有しつつ、既存 TS が参照する DOM id は維持する。
export function SincroPageAppShell({ controlPanel, onCharacterMounted }: SincroPageAppShellProps) {
    const rightToolState = useRightToolPanelState();

    return (
        <>
            <ConfigurationDialog />
            <div id="sincroBody" className="sincroPageShell sincroPageShell--modern">
                <SincroShellHeader />
                <SincroVideoPlaceholders />
                <ChatAnnouncer />
                <SincroChatRegion hidden={rightToolState.activePanel === "history"} />
                <SincroCharacterRegion onMounted={onCharacterMounted} />
                <SincroBackgroundRegion />
                <SincroFooterRegion />
                <SincroRightToolFrames
                    activePanel={rightToolState.activePanel}
                    controlPanel={controlPanel}
                />
                <SincroPopRegion />
            </div>
        </>
    );
}

// 題名と右上メニューを描画し、その下端をパネル・重要通知の配置へ共有する。
function SincroShellHeader() {
    const { settings } = useSincroAppControllerSettingsState();
    const headerRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const node = headerRef.current;
        // 重要通知は本文の兄弟にも配置されるため、計測値を文書全体へ公開する。
        const root = node?.ownerDocument.documentElement;
        if (!node || !root) return;
        // 文字拡大・狭幅の折り返し後も、パネル操作を常設ヘッダーの下へ配置する。
        const measure = () =>
            root.style.setProperty(
                "--sincro-chrome-bottom",
                `${Math.max(node.getBoundingClientRect().bottom, ...[...node.children].map((child) => child.getBoundingClientRect().bottom)) + 8}px`,
            );
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        for (const child of node.children) observer.observe(child);
        measure();
        return () => {
            observer.disconnect();
            root.style.removeProperty("--sincro-chrome-bottom");
        };
    }, []);
    return (
        <div id="sincroHeaderContainer" ref={headerRef}>
            <div id="sincroHeaderBox">
                <div id="sincroHeaderBox__brand">
                    <div className="headerIconBox">
                        <img
                            className="headerIconBox__icon"
                            src="../images/icon-system.webp"
                            alt=""
                        />
                    </div>
                    <div id="sincroHeaderBox__textGroup">
                        <div id="sincroHeaderBox__text">
                            {settings.titleText === "" ? "Sincromisor" : settings.titleText}
                        </div>
                    </div>
                </div>
                <div id="sincroHeaderBox__toolChrome">
                    <div id="sincroDebugMenuRoot">
                        <RightToolMenu />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SincroVideoPlaceholders() {
    return (
        <div id="sincroVideoContainer">
            <div id="sincroVideoBox1">Video1です。 1600x900</div>
            <div id="sincroVideoBox2">Video2です。 1600x900</div>
        </div>
    );
}

function SincroChatRegion({ hidden }: { hidden: boolean }) {
    return (
        <div id="sincroChatContainer" hidden={hidden}>
            <div id="sincroChatBox">
                <SincroChatView />
            </div>
        </div>
    );
}

// 同じコミットで全パネルの配置が終わった後、2つの参照をページ初期化へ渡す。
function SincroCharacterRegion({ onMounted }: { onMounted: (roots: SincroVRMRoots) => void }) {
    const canvasRoot = useRef<HTMLDivElement>(null);
    const characterControlLayer = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (canvasRoot.current && characterControlLayer.current) {
            onMounted({
                canvasRoot: canvasRoot.current,
                characterControlLayer: characterControlLayer.current,
            });
        }
    }, [onMounted]);
    return (
        <div id="sincroCharacterContainer">
            <div id="sincroCharacterBox" ref={canvasRoot}>
                <canvas id="sincroCharacterBox__canvas"></canvas>
                <div
                    id="sincroCharacterControlLayer"
                    ref={characterControlLayer}
                    aria-hidden="true"
                ></div>
            </div>
        </div>
    );
}

function SincroBackgroundRegion() {
    return (
        <div id="sincroBackgroundContainer">
            <div id="sincroBackgroundBox"></div>
        </div>
    );
}

function SincroFooterRegion() {
    return (
        <div id="sincroFooterContainer">
            <div id="sincroFooterBox">
                <SincroTelopView />
            </div>
        </div>
    );
}

type SincroRightToolFramesProps = {
    activePanel: ReturnType<typeof useRightToolPanelState>["activePanel"];
    controlPanel: ReactElement;
};

// 両パネルを常設し、診断には表示状態を渡して購読だけを休止する。
function SincroRightToolFrames({ activePanel, controlPanel }: SincroRightToolFramesProps) {
    return (
        <>
            <RightToolFrame
                id="sincroHistoryPanelContainer"
                isOpen={activePanel === "history"}
                title="会話履歴"
                onClose={hideRightToolHistoryPanel}
                variant="history"
            >
                <ConversationHistoryView isVisible={activePanel === "history"} />
            </RightToolFrame>
            <RightToolFrame
                id="sincroDebugConsoleContainer"
                isOpen={activePanel === "debug"}
                title="開発者ツール"
                ariaLabel="開発者ツール"
                onClose={hideRightToolDebugPanel}
                variant="debug"
            >
                <DebugConsole isVisible={activePanel === "debug"} />
            </RightToolFrame>
            <RightToolFrame
                id="sincroReactSettingsPanelContainer"
                isOpen={activePanel === "settings"}
                title="基本設定"
                ariaLabel="基本設定"
                onClose={hideRightToolSettingsPanel}
                variant="settings"
            >
                <div id="reactSettingsPanel">
                    <div id="sincroReactSettingsPanelRoot">{controlPanel}</div>
                </div>
            </RightToolFrame>
        </>
    );
}

function SincroPopRegion() {
    return (
        <div id="sincroPopContainer">
            <div id="sincroPopBox"></div>
        </div>
    );
}
