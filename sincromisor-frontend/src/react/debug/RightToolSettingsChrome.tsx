import { hideRightToolSettingsPanel } from "../app/useRightToolPanelState";
import { OverlayCloseButton } from "../overlay/OverlayCloseButton";

export function RightToolSettingsChrome() {
    return (
        <OverlayCloseButton id="reactSettingsPanelClose" ariaLabel="設定パネルを閉じる" onClick={hideRightToolSettingsPanel} />
    );
}
