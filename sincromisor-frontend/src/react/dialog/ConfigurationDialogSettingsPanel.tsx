import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";
import "./configurationDialogSettings.css";
import {
    DialogVrmDropStatusCard,
    VrmModelSection,
} from "./components/DialogSettingsSections";
import {
    DialogBasicSettingsSection,
    DialogDeviceSettingsSection,
    DialogCharacterSettingsSection,
    DialogMicSettingsSection,
} from "./components/DialogSettingsFormSections";

// 起動前 dialog の見た目/操作を React 側で主導する設定パネル。
// 既存 input/select/button/file は DialogManager bridge 用DOMとして残し、AppController/applySettings 経由で同期する。
export function ConfigurationDialogSettingsPanel() {
    const {
        currentController,
        settings,
        settingsUiState,
        settingsUiHints,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
        applySettings,
        changeTalkMode,
        dialogVrmUiState,
        dialogUiState,
        openVrmFilePicker,
        startApp,
    } = useConfigurationDialogSettingsState();

    return (
        <div className="configurationDialogReactSettingsPanel" aria-label="起動前設定">
            {/* 起動前設定は閉じる導線を制限しているため、ヘッダーはタイトルのみ。 */}
            <div className="configurationDialogReactSettingsPanel__header">
                <div className="configurationDialogReactSettingsPanel__title">起動前設定</div>
            </div>
            <div className="configurationDialogReactSettingsPanel__hintText">
                はじめる前に、使うマイクやカメラ、基本の動きをここで決められます。接続確認や詳しい診断が必要な時だけ、開発者向け診断画面を使います。
            </div>
            <DialogBasicSettingsSection
                settings={settings}
                uiState={settingsUiState}
                onTitleChange={(titleText) => applySettings({ titleText })}
                onTalkModeChange={changeTalkMode}
            />
            <DialogDeviceSettingsSection
                settings={settings}
                uiState={settingsUiState}
                uiHints={settingsUiHints}
                snapshot={mediaDeviceSnapshot}
                audioInputSelection={audioInputSelection}
                videoInputSelection={videoInputSelection}
                onApplySettings={applySettings}
                onRefreshDevices={refreshDevices}
            />
            <DialogMicSettingsSection
                settings={settings}
                uiState={settingsUiState}
                onApplySettings={applySettings}
            />
            <DialogCharacterSettingsSection
                settings={settings}
                uiState={settingsUiState}
                uiHints={settingsUiHints}
                onApplySettings={applySettings}
            />
            <VrmModelSection onOpenFilePicker={openVrmFilePicker} />
            <DialogVrmDropStatusCard uiState={dialogVrmUiState} />
            <div className="configurationDialogReactSettingsPanel__actions">
                {/* 利用不可時は説明カードではなく disabled ボタンで表現する。 */}
                <button
                    type="button"
                    className="configurationDialogReactSettingsPanel__startButton"
                    onClick={startApp}
                    disabled={!currentController || dialogUiState.startButtonDisabled}
                >
                    {dialogUiState.startButtonText || "はじめる"}
                </button>
            </div>
            {dialogUiState.startButtonHint ? (
                <div className="configurationDialogReactSettingsPanel__hintText">
                    {dialogUiState.startButtonHint}
                </div>
            ) : null}
            <div className="configurationDialogReactSettingsPanel__footer">
                <a className="configurationDialogReactSettingsPanel__backLink" href="/">
                    &lt;&lt; もどる
                </a>
            </div>
        </div>
    );
}
