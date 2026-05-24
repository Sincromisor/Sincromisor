import { createCoreSettingsPage } from "../../../features/settings/react/pages/coreSettingsPages";
import { settingsPageCopy } from "../../../features/settings/react/shell/settingsPageCopy";
import type { SettingsShellPage } from "../../../features/settings/react/shell/settingsShell";
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
    return createCoreSettingsPage("connection", <ConnectionSettingsPage panelState={panelState} />);
}
