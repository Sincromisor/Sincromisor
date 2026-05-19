import { settingsPageCopy } from "../settingsShell/settingsPageCopy";
import type { SettingsShellPage } from "../settingsShell/settingsShell";
import { LookingGlassControlPage } from "./lookingGlassControlPage";
import { ConnectionSettingsPage } from "./simpleVrmConnectionPage";
import type { SimpleVrmPanelState } from "./simpleVrmControlPanelTypes";
import { createSimpleVrmSettingsPages } from "./simpleVrmSettingsPages";

type SimpleVrmControlPanelPagesOptions = {
    panelState: SimpleVrmPanelState;
    isLookingGlassFocused: boolean;
};

export function createSimpleVrmControlPanelPages({
    panelState,
    isLookingGlassFocused,
}: SimpleVrmControlPanelPagesOptions): SettingsShellPage[] {
    const settingsPages = createSimpleVrmSettingsPages(panelState);

    return [
        isLookingGlassFocused ? createLookingGlassPage(panelState) : settingsPages[0],
        ...settingsPages.slice(1),
        createConnectionPage(panelState),
    ].filter((page): page is SettingsShellPage => page !== undefined);
}

function createLookingGlassPage(panelState: SimpleVrmPanelState): SettingsShellPage {
    return {
        id: "looking-glass",
        label: settingsPageCopy.lookingGlass.label,
        title: settingsPageCopy.lookingGlass.title,
        content: <LookingGlassControlPage panelState={panelState} />,
    };
}

function createConnectionPage(panelState: SimpleVrmPanelState): SettingsShellPage {
    return {
        id: "connection",
        label: settingsPageCopy.connection.label,
        title: settingsPageCopy.connection.title,
        description: settingsPageCopy.connection.description,
        content: <ConnectionSettingsPage panelState={panelState} />,
    };
}
