import type { ReactElement } from "react";
import {
    hideRightToolDebugPanel,
    hideRightToolSettingsPanel,
    useRightToolPanelState,
} from "../../react/app/useRightToolPanelState";
import { SincroChatView } from "../../react/chat/sincroChatView";
import { DebugConsole } from "../../react/debug/debugConsole";
import { RightToolMenu } from "../../react/debug/rightToolMenu";
import { ConfigurationDialog } from "../../react/dialog/configurationDialog";
import { RightToolFrame } from "../../react/overlay/rightToolFrame";
import { SincroTelopView } from "../../react/telop/sincroTelopView";

type SincroPageAppShellProps = {
    controlPanel: ReactElement;
};

// modern 系ページで共通利用する app shell。
// React が UI 骨格と island 間の配置を一括で所有しつつ、既存 TS が参照する DOM id は維持する。
export function SincroPageAppShell({ controlPanel }: SincroPageAppShellProps) {
    const rightToolState = useRightToolPanelState();

    return (
        <>
            <ConfigurationDialog />
            <div id="sincroBody" className="sincroPageShell sincroPageShell--modern">
                <SincroShellHeader />
                <SincroVideoPlaceholders />
                <SincroChatRegion />
                <SincroCharacterRegion />
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

function SincroShellHeader() {
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
                        <div id="sincroHeaderBox__text">Sincromisor</div>
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

function SincroCharacterRegion() {
    return (
        <div id="sincroCharacterContainer">
            <div id="sincroCharacterBox">
                <canvas id="sincroCharacterBox__canvas"></canvas>
                <div id="sincroCharacterControlLayer" aria-hidden="true"></div>
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
