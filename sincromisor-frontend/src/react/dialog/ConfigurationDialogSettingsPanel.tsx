import { SettingsShell, SettingsStatusCard, SettingsSummaryGrid } from "../settings-shell/SettingsShell";
import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";
import "./configurationDialogSettings.css";
import {
    DialogVrmDropStatusCard,
    VrmModelSection,
} from "./components/DialogSettingsSections";
import {
    DialogBasicSettingsSection,
    DialogCharacterSettingsSection,
    DialogDeviceSettingsSection,
    DialogMicSettingsSection,
    DialogStartupSettingsSection,
} from "./components/DialogSettingsFormSections";

function formatSelectionLabel(params: {
    selectedLabel: string | null;
    isSelected: boolean;
    isAvailable: boolean;
    fallbackLabel: string;
    unavailableLabel: string;
}): string {
    if (!params.isSelected) {
        return params.fallbackLabel;
    }
    if (params.isAvailable && params.selectedLabel) {
        return params.selectedLabel;
    }
    return params.unavailableLabel;
}

function connectionTone(value: string): "neutral" | "good" | "warn" {
    if (value === "connected") {
        return "good";
    }
    if (value === "idle" || value === "stopped") {
        return "neutral";
    }
    return "warn";
}

// 起動前 dialog の見た目/操作を React 側で主導する設定パネル。
// bridge DOM は AppController/dialog bridge のために残し、表示と操作導線だけ React 側へ寄せる。
export function ConfigurationDialogSettingsPanel() {
    const {
        currentController,
        lifecycleState,
        connectionState,
        settings,
        settingsUiState,
        settingsUiHints,
        startupSettingsStatus,
        startupSettingsCapabilities,
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

    const connectionDetail = connectionState.detail || dialogUiState.startButtonHint || "最初に必要な設定を確認してから開始します。";
    const microphoneValue = formatSelectionLabel({
        selectedLabel: audioInputSelection.matchedDevice?.label ?? null,
        isSelected: audioInputSelection.isSelected,
        isAvailable: audioInputSelection.isAvailable,
        fallbackLabel: "ブラウザ既定",
        unavailableLabel: "未検出のマイク",
    });
    const cameraValue = formatSelectionLabel({
        selectedLabel: videoInputSelection.matchedDevice?.label ?? null,
        isSelected: videoInputSelection.isSelected,
        isAvailable: videoInputSelection.isAvailable,
        fallbackLabel: settings.enableCharacterGaze ? "ブラウザ既定" : "視線連動オフ",
        unavailableLabel: "未検出のカメラ",
    });
    const startButtonLabel = dialogUiState.startButtonText || "開始する";
    const startButtonHint = dialogUiState.startButtonHint ?? "必要な設定を確認したら、このまま開始できます。";

    return (
        <div className="configurationDialogReactSettingsPanel">
            <SettingsShell
                ariaLabel="初回セットアップウィザード"
                badge="初回セットアップ"
                title="会話を始める前のセットアップ"
                description="この画面で会話・音声・表示の準備を確認します。完了すると会話画面へ進み、開始後の設定パネルからも同じ項目を見直せます。"
                initialPageId="conversation"
                pages={[
                    {
                        id: "conversation",
                        label: "会話",
                        title: "会話",
                        description: "最初に、会話画面で使う名前と会話モードを確認します。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="接続状態"
                                    value={connectionState.value}
                                    detail={connectionDetail}
                                    tone={connectionTone(connectionState.value)}
                                />
                                <SettingsStatusCard
                                    label="現在のタイトル"
                                    value={settings.titleText || "未設定"}
                                    detail="会話UIに表示する名前として使われます。"
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <DialogBasicSettingsSection
                                settings={settings}
                                uiState={settingsUiState}
                                onTitleChange={(titleText) => applySettings({ titleText })}
                                onTalkModeChange={changeTalkMode}
                                showSectionTitle={false}
                            />
                        ),
                    },
                    {
                        id: "audio",
                        label: "音声",
                        title: "音声",
                        description: "使うマイクと、声の入り方に関わる準備をここで整えます。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="マイク"
                                    value={microphoneValue}
                                    detail={settingsUiHints.audioInputDeviceReason ?? "開始後も同じマイク設定を引き継ぎます。"}
                                    tone={audioInputSelection.isSelected && !audioInputSelection.isAvailable ? "warn" : "neutral"}
                                />
                                <SettingsStatusCard
                                    label="デバイス一覧"
                                    value={mediaDeviceSnapshot.isRefreshing ? "更新中" : "確認可能"}
                                    detail={mediaDeviceSnapshot.labelsResolved ? "実デバイス名を表示できています。" : "権限未許可だと実デバイス名が出ないことがあります。"}
                                    tone={mediaDeviceSnapshot.refreshError ? "warn" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <>
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
                            </>
                        ),
                    },
                    {
                        id: "display",
                        label: "表示",
                        title: "表示",
                        description: "キャラクター表示、視線連動、VRM モデルを開始前に確認します。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="3Dキャラクター"
                                    value={settings.enableCharacter ? "表示する" : "表示しない"}
                                    detail={settingsUiHints.enableCharacterReason ?? "表示負荷を抑えたい時はオフにできます。"}
                                    tone={settings.enableCharacter ? "good" : "neutral"}
                                />
                                <SettingsStatusCard
                                    label="視線用カメラ"
                                    value={cameraValue}
                                    detail={settingsUiHints.videoInputDeviceReason ?? settingsUiHints.enableCharacterGazeReason ?? "顔の向きや視線連動に使います。"}
                                    tone={settings.enableCharacterGaze && videoInputSelection.isSelected && !videoInputSelection.isAvailable ? "warn" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <>
                                <DialogCharacterSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    uiHints={settingsUiHints}
                                    onApplySettings={applySettings}
                                    showSectionTitle={false}
                                />
                                <VrmModelSection onOpenFilePicker={openVrmFilePicker} />
                                <DialogVrmDropStatusCard uiState={dialogVrmUiState} />
                            </>
                        ),
                    },
                    {
                        id: "startup",
                        label: "起動",
                        title: "起動",
                        description: "開始した時にだけ効く動きやオプションを確認します。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="反映タイミング"
                                    value={startupSettingsStatus.requiresRestart ? "再開始が必要" : startupSettingsStatus.willApplyOnNextStart ? "次回開始で反映" : "すぐ使える状態"}
                                    detail={startupSettingsStatus.changedKeys.length > 0 ? `変更中: ${startupSettingsStatus.changedKeys.join(", ")}` : "開始前の準備項目をまとめています。"}
                                    tone={startupSettingsStatus.requiresRestart ? "warn" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <DialogStartupSettingsSection
                                settings={settings}
                                uiState={settingsUiState}
                                onApplySettings={applySettings}
                                startupStatus={startupSettingsStatus}
                                startupCapabilities={startupSettingsCapabilities}
                                isRunning={lifecycleState === "running"}
                                showSectionTitle={false}
                            />
                        ),
                    },
                    {
                        id: "connection",
                        label: "接続",
                        title: "接続",
                        description: "開始前の確認ページです。準備が整ったら下のボタンから会話を始めます。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="接続状態"
                                    value={connectionState.value}
                                    detail={connectionDetail}
                                    tone={connectionTone(connectionState.value)}
                                />
                                <SettingsStatusCard
                                    label="開始ボタン"
                                    value={dialogUiState.startButtonDisabled ? "待機中" : "開始できます"}
                                    detail={dialogUiState.startButtonText || "はじめる"}
                                    tone={dialogUiState.startButtonDisabled ? "warn" : "good"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <div className="configurationDialogReactSettingsPanel__connectionPage">
                                <div className="configurationDialogReactSettingsPanel__hintText">
                                    このセットアップは開始前の必須フローです。内容を確認したら、下の主ボタンから会話を始めてください。
                                </div>
                            </div>
                        ),
                    },
                ]}
                footer={(
                    <div className="configurationDialogReactSettingsPanel__footer">
                        <div className="configurationDialogReactSettingsPanel__exitHint">
                            途中で離れる場合はトップへ戻れます。ESC キーや背景クリックでは閉じません。
                        </div>
                        <div className="configurationDialogReactSettingsPanel__primaryAction">
                            <button
                                type="button"
                                className="configurationDialogReactSettingsPanel__startButton"
                                onClick={startApp}
                                disabled={!currentController || dialogUiState.startButtonDisabled}
                            >
                                {startButtonLabel}
                            </button>
                            <div className="configurationDialogReactSettingsPanel__hintText">
                                {startButtonHint}
                            </div>
                        </div>
                        <a className="configurationDialogReactSettingsPanel__backLink" href="/">
                            トップへ戻る
                        </a>
                    </div>
                )}
            />
        </div>
    );
}
