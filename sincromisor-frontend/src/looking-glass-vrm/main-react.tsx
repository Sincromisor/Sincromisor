import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

// looking-glass-vrm 用 React island のマウント入口。
// React UI は共通 panel/dialog 基盤を再利用し、LG 固有差分はページ別 panel に閉じる。
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

mountAsync("sincroReactSettingsPanelRoot", () => import("../react/looking-glass-vrm/LookingGlassVrmControlPanel"), (m) => <m.LookingGlassVrmControlPanel />);
mountAsync("sincroReactSettingsPanelChromeRoot", () => import("../react/debug/RightToolSettingsChrome"), (m) => <m.RightToolSettingsChrome />);
mountAsync("sincroDebugMenuRoot", () => import("../react/debug/RightToolMenu"), (m) => <m.RightToolMenu />);
mountAsync("sincroDebugConsoleContainer", () => import("../react/debug/DebugConsole"), (m) => <m.DebugConsole />);
mountAsync("sincroChatBox", () => import("../react/chat/SincroChatView"), (m) => <m.SincroChatView />);
mountAsync("sincroFooterBox", () => import("../react/telop/SincroTelopView"), (m) => <m.SincroTelopView />);
mountAsync("sincroDialogReactSettingsRoot", () => import("../react/dialog/ConfigurationDialogSettingsPanel"), (m) => <m.ConfigurationDialogSettingsPanel />);
mountAsync("sincroDialogPopBox", () => import("../react/dialog/DialogPopMessages"), (m) => <m.DialogPopMessages />);
