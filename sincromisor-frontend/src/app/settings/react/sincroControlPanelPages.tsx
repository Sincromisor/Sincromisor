import { createCoreSettingsPage } from "../../../features/settings/react/pages/coreSettingsPages";
import { settingsPageCopy } from "../../../features/settings/react/shell/settingsPageCopy";
import type { SettingsShellPage } from "../../../features/settings/react/shell/settingsShell";
import { LookingGlassControlPage } from "./lookingGlassControlPage";
import { ConnectionSettingsPage } from "./sincroConnectionPage";
import type { SincroPanelState } from "./sincroControlPanelTypes";
import { createSincroSettingsPages } from "./sincroSettingsPages";

type SincroControlPanelPagesOptions = {
    panelState: SincroPanelState;
    isLookingGlassFocused: boolean;
};

/** 共通の分類順を使い、Looking Glassでは先頭だけ専用操作へ差し替える。 */
export function createSincroControlPanelPages({
    panelState,
    isLookingGlassFocused,
}: SincroControlPanelPagesOptions): SettingsShellPage[] {
    const settingsPages = createSincroSettingsPages(panelState);

    return [
        isLookingGlassFocused ? createLookingGlassPage(panelState) : settingsPages[0],
        ...settingsPages.slice(1),
        createConnectionPage(panelState),
    ].filter((page): page is SettingsShellPage => page !== undefined);
}

function createLookingGlassPage(panelState: SincroPanelState): SettingsShellPage {
    return {
        id: "looking-glass",
        label: settingsPageCopy.lookingGlass.label,
        title: settingsPageCopy.lookingGlass.title,
        content: <LookingGlassControlPage panelState={panelState} />,
    };
}

function createConnectionPage(panelState: SincroPanelState): SettingsShellPage {
    return createCoreSettingsPage("connection", <ConnectionSettingsPage panelState={panelState} />);
}
