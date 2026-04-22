import { hideReactSettingsPanel } from "../../ts/UI/rightToolPanelStore";

export function RightToolSettingsChrome() {
    return (
        <button id="reactSettingsPanelClose" type="button" aria-label="設定パネルを閉じる" onClick={hideReactSettingsPanel}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.3 6.7a1 1 0 0 0-1.4 0L12 11.6 7.1 6.7a1 1 0 1 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4l-4.9-4.9 4.9-4.9a1 1 0 0 0 0-1.4z" />
            </svg>
        </button>
    );
}
