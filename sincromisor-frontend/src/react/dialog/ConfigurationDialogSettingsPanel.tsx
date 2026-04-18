import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";
import "./configurationDialogSettings.css";
import {
    DialogVrmDropStatusCard,
    VrmModelSection,
} from "./components/DialogSettingsSections";
import {
    DialogSettingsCategory,
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
                はじめる前に、目的ごとに分かれた設定を確認できます。会話・音声・表示を順に見ていけば、そのまま始められます。
            </div>
            <DialogSettingsCategory
                title="会話設定"
                description="会話タイトルやトークモードを決めます。まず最初に見ておくと分かりやすい設定です。"
            >
                <DialogBasicSettingsSection
                    settings={settings}
                    uiState={settingsUiState}
                    onTitleChange={(titleText) => applySettings({ titleText })}
                    onTalkModeChange={changeTalkMode}
                    showSectionTitle={false}
                />
            </DialogSettingsCategory>
            <DialogSettingsCategory
                title="音声設定"
                description="使うマイクと、声の入り方に関する設定です。開始後の設定パネルにも引き継がれます。"
            >
                <DialogDeviceSettingsSection
                    settings={settings}
                    uiState={settingsUiState}
                    uiHints={settingsUiHints}
                    snapshot={mediaDeviceSnapshot}
                    audioInputSelection={audioInputSelection}
                    videoInputSelection={videoInputSelection}
                    onApplySettings={applySettings}
                    onRefreshDevices={refreshDevices}
                    showSectionTitle={false}
                />
                <DialogMicSettingsSection
                    settings={settings}
                    uiState={settingsUiState}
                    onApplySettings={applySettings}
                    showSectionTitle={false}
                />
            </DialogSettingsCategory>
            <DialogSettingsCategory
                title="表示設定"
                description="キャラクター表示や視線連動、利用する VRM モデルを開始前に整えます。"
            >
                <DialogCharacterSettingsSection
                    settings={settings}
                    uiState={settingsUiState}
                    uiHints={settingsUiHints}
                    onApplySettings={applySettings}
                    showSectionTitle={false}
                />
                <VrmModelSection onOpenFilePicker={openVrmFilePicker} />
                <DialogVrmDropStatusCard uiState={dialogVrmUiState} />
            </DialogSettingsCategory>
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
