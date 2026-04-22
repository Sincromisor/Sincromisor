import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

// vrm360 用 React island のマウント入口。
// 360 ページでも simple-vrm と同じ React UI 群を遅延読込し、scene 差分は TS 側へ残す。
function mountAsync<TModule>(
    elementId: string,
    load: () => Promise<TModule>,
    render: (module: TModule) => ReactElement,
): void {
    const mountNode = document.getElementById(elementId);
    if (!mountNode) {
        return;
    }
    load().then((module) => {
        createRoot(mountNode).render(render(module));
    });
}

mountAsync("sincroReactSettingsPanelRoot", () => import("../react/vrm360/Vrm360ControlPanel"), (m) => <m.Vrm360ControlPanel />);
mountAsync("sincroReactSettingsPanelChromeRoot", () => import("../react/debug/RightToolSettingsChrome"), (m) => <m.RightToolSettingsChrome />);
mountAsync("sincroDebugMenuRoot", () => import("../react/debug/RightToolMenu"), (m) => <m.RightToolMenu />);
mountAsync("sincroDebugConsoleContainer", () => import("../react/debug/DebugConsole"), (m) => <m.DebugConsole />);
mountAsync("sincroChatBox", () => import("../react/chat/SincroChatView"), (m) => <m.SincroChatView />);
mountAsync("sincroFooterBox", () => import("../react/telop/SincroTelopView"), (m) => <m.SincroTelopView />);
mountAsync("sincroDialogReactSettingsRoot", () => import("../react/dialog/ConfigurationDialogSettingsPanel"), (m) => <m.ConfigurationDialogSettingsPanel />);
mountAsync("sincroDialogPopBox", () => import("../react/dialog/DialogPopMessages"), (m) => <m.DialogPopMessages />);
