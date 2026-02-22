import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

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

mountAsync("sincroReactSettingsPanelRoot", () => import("../react/simple-vrm/SimpleVrmControlPanel"), (m) => <m.SimpleVrmControlPanel />);
mountAsync("sincroChatBox", () => import("../react/chat/SincroChatView"), (m) => <m.SincroChatView />);
mountAsync("sincroFooterBox", () => import("../react/telop/SincroTelopView"), (m) => <m.SincroTelopView />);
mountAsync("sincroDialogReactSettingsRoot", () => import("../react/dialog/ConfigurationDialogSettingsPanel"), (m) => <m.ConfigurationDialogSettingsPanel />);
mountAsync("sincroDialogPopBox", () => import("../react/dialog/DialogPopMessages"), (m) => <m.DialogPopMessages />);
