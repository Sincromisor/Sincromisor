import type { ReactElement } from "react";
import { SincroChatView } from "../chat/SincroChatView";
import { DebugConsole } from "../debug/DebugConsole";
import { RightToolMenu } from "../debug/RightToolMenu";
import { RightToolSettingsChrome } from "../debug/RightToolSettingsChrome";
import { ConfigurationDialogSettingsPanel } from "../dialog/ConfigurationDialogSettingsPanel";
import { DialogPopMessages } from "../dialog/DialogPopMessages";
import { SincroTelopView } from "../telop/SincroTelopView";

type SincroPageAppShellProps = {
    controlPanel: ReactElement;
};

// modern 系ページで共通利用する app shell。
// React が UI 骨格と island 間の配置を一括で所有しつつ、既存 TS が参照する DOM id は維持する。
export function SincroPageAppShell({ controlPanel }: SincroPageAppShellProps) {
    return (
        <>
            <dialog id="configurationDialog">
                <div id="sincroDialogPopContainer">
                    <div id="sincroDialogPopBox">
                        <DialogPopMessages />
                    </div>
                </div>
                <div id="sincroDialogReactSettingsRoot">
                    <ConfigurationDialogSettingsPanel />
                </div>
            </dialog>

            <div id="sincroBody">
                <div id="sincroHeaderContainer">
                    <div id="sincroHeaderBox">
                        <div className="headerIconBox leftIconBox">
                            <img className="headerIconBox__icon" src="../images/icon-system.webp" alt="" />
                        </div>
                        <div id="sincroHeaderBox__leftDecoration"></div>
                        <div id="sincroHeaderBox__text">Sincromisor</div>
                        <div id="sincroHeaderBox__rightDecoration"></div>
                        <div className="headerIconBox rightIconBox">
                            <div id="sincroDebugMenuRoot">
                                <RightToolMenu />
                            </div>
                        </div>
                    </div>
                </div>

                <div id="sincroVideoContainer">
                    <div id="sincroVideoBox1">
                        Video1です。
                        1600x900
                    </div>
                    <div id="sincroVideoBox2">
                        Video2です。
                        1600x900
                    </div>
                </div>

                <div id="sincroChatContainer">
                    <div id="sincroChatBox">
                        <SincroChatView />
                    </div>
                </div>

                <div id="sincroCharacterContainer">
                    <div id="sincroCharacterBox">
                        <canvas id="sincroCharacterBox__canvas"></canvas>
                    </div>
                </div>

                <div id="sincroBackgroundContainer">
                    <div id="sincroBackgroundBox"></div>
                </div>

                <div id="sincroFooterContainer">
                    <div id="sincroFooterBox">
                        <SincroTelopView />
                    </div>
                </div>

                <div id="sincroDebugConsoleContainer">
                    <DebugConsole />
                </div>

                <div id="sincroReactSettingsPanelContainer">
                    <div id="reactSettingsPanel">
                        <div id="sincroReactSettingsPanelChromeRoot">
                            <RightToolSettingsChrome />
                        </div>
                        <div id="sincroReactSettingsPanelRoot">
                            {controlPanel}
                        </div>
                    </div>
                </div>

                <div id="sincroPopContainer">
                    <div id="sincroPopBox"></div>
                </div>
            </div>
        </>
    );
}
