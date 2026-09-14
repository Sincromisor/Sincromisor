import { type ReactElement, useEffect, useRef } from "react";
import { SincroChatView } from "../../features/conversation/chat/react/sincroChatView";
import { SincroTelopView } from "../../features/conversation/telop/react/sincroTelopView";
import { DebugConsole } from "../../features/debug/react/debugConsole";
import { RightToolMenu } from "../../features/debug/react/rightToolMenu";
import { ConfigurationDialog } from "../../features/dialog/react/configurationDialog";
import type { SincroVRMRoots } from "../bootstrap/sincroVrmInitializer";
import {
    hideRightToolDebugPanel,
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
                <SincroChatRegion />
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

// 題名も設定パネルと同じ購読で描画し、有効な制御処理の差し替えに追従する。
function SincroShellHeader() {
    const { settings } = useSincroAppControllerSettingsState();
    return (
        <div id="sincroHeaderContainer">
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
                        <div id="sincroHeaderBox__text">{settings.titleText}</div>
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

function SincroChatRegion() {
    return (
        <div id="sincroChatContainer">
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

function SincroRightToolFrames({ activePanel, controlPanel }: SincroRightToolFramesProps) {
    return (
        <>
            <RightToolFrame
                id="sincroDebugConsoleContainer"
                isOpen={activePanel === "debug"}
                title="開発者ツール"
                ariaLabel="開発者ツール"
                onClose={hideRightToolDebugPanel}
                variant="debug"
            >
                <DebugConsole />
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
