import { settingsPageCopy } from "../../../features/settings/react/shell/settingsPageCopy";
import type { SettingsShellPage } from "../../../features/settings/react/shell/settingsShell";
import { LookingGlassControlPage } from "./lookingGlassControlPage";
import type { SincroPanelState } from "./sincroControlPanelTypes";
import { createSincroSettingsPages } from "./sincroSettingsPages";

/** 共通5分類を維持し、対応ページにだけLooking Glass専用分類を追加する。 */
export function createSincroControlPanelPages({
    panelState,
    isLookingGlassFocused,
}: {
    panelState: SincroPanelState;
    isLookingGlassFocused: boolean;
}): SettingsShellPage[] {
    return [
        ...createSincroSettingsPages(panelState),
        ...(isLookingGlassFocused
            ? [
                  {
                      id: "looking-glass",
                      ...settingsPageCopy.lookingGlass,
                      content: <LookingGlassControlPage panelState={panelState} />,
                  },
              ]
            : []),
    ];
}
