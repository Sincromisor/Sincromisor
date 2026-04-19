import { SettingsShell, SettingsStatusCard, SettingsSummaryGrid } from "../settings-shell/SettingsShell";
import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";
import "./configurationDialogSettings.css";
import {
    DialogVrmDropStatusCard,
    VrmModelSection,
} from "./components/DialogSettingsSections";
import {
    DialogSettingsCategory,
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

function connectionStatusLabel(value: string): string {
    switch (value) {
        case "connected":
            return "接続済み";
        case "starting":
            return "開始準備中";
        case "connecting":
            return "接続中";
        case "degraded":
            return "要確認";
        case "stopping":
            return "停止中";
        case "stopped":
        case "idle":
            return "未接続";
        default:
            return value;
    }
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
                                    value={connectionStatusLabel(connectionState.value)}
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
                            <DialogSettingsCategory
                                title="会話の基本"
                                description="会話画面に表示する名前と、やり取りの進み方をここで決めます。開始後の設定パネルでも同じ分類で見直せます。"
                            >
                                <DialogBasicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onTitleChange={(titleText) => applySettings({ titleText })}
                                    onTalkModeChange={changeTalkMode}
                                    showSectionTitle={false}
                                />
                            </DialogSettingsCategory>
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
                                <DialogSettingsCategory
                                    title="入力デバイス"
                                    description="開始前に使うマイクと視線用カメラを確認します。開始後もここで選んだ内容を引き継ぎます。"
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
                                </DialogSettingsCategory>
                                <DialogSettingsCategory
                                    title="マイク前処理"
                                    description="ノイズや反響の多い環境でも話しやすくするための補正です。必要なものだけオンにして試せます。"
                                >
                                    <DialogMicSettingsSection
                                        settings={settings}
                                        uiState={settingsUiState}
                                        onApplySettings={applySettings}
                                        showSectionTitle={false}
                                    />
                                </DialogSettingsCategory>
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
                                <DialogSettingsCategory
                                    title="キャラクター表示"
                                    description="3Dキャラクター、顔の向き連動、自動ミュートなど、見た目とふるまいをまとめて調整します。"
                                >
                                    <DialogCharacterSettingsSection
                                        settings={settings}
                                        uiState={settingsUiState}
                                        uiHints={settingsUiHints}
                                        onApplySettings={applySettings}
                                        showSectionTitle={false}
                                    />
                                </DialogSettingsCategory>
                                <DialogSettingsCategory
                                    title="VRM モデル"
                                    description="表示するモデルを差し替えたい時の導線です。ファイル選択とドラッグ&ドロップのどちらでも更新できます。"
                                >
                                    <VrmModelSection onOpenFilePicker={openVrmFilePicker} />
                                    <DialogVrmDropStatusCard uiState={dialogVrmUiState} />
                                </DialogSettingsCategory>
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
                            <DialogSettingsCategory
                                title="開始時のオプション"
                                description="開始した瞬間にだけ効く準備項目です。反映タイミングもこの面の中でまとめて確認できます。"
                            >
                                <DialogStartupSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onApplySettings={applySettings}
                                    startupStatus={startupSettingsStatus}
                                    startupCapabilities={startupSettingsCapabilities}
                                    isRunning={lifecycleState === "running"}
                                    showSectionTitle={false}
                                />
                            </DialogSettingsCategory>
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
                                    value={connectionStatusLabel(connectionState.value)}
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
                            <DialogSettingsCategory
                                title="開始前の確認"
                                description="最後に、会話を始める前の見通しをここでそろえます。必要な項目だけ見直したら下の主ボタンへ進んでください。"
                            >
                                <div className="configurationDialogReactSettingsPanel__connectionPage">
                                    <div className="configurationDialogReactSettingsPanel__hintText">
                                        このセットアップは開始前の必須フローです。途中で離れる場合はトップへ戻れます。
                                    </div>
                                    <div className="configurationDialogReactSettingsPanel__checkList">
                                        <div className="configurationDialogReactSettingsPanel__checkItem">
                                            会話画面の表示名とトークモードを確認済み
                                        </div>
                                        <div className="configurationDialogReactSettingsPanel__checkItem">
                                            使うマイクと、必要なら視線用カメラを選択済み
                                        </div>
                                        <div className="configurationDialogReactSettingsPanel__checkItem">
                                            開始時のオプションや表示設定を確認済み
                                        </div>
                                    </div>
                                </div>
                            </DialogSettingsCategory>
                        ),
                    },
                ]}
                footer={(
                    <div className="configurationDialogReactSettingsPanel__footer">
                        <div className="configurationDialogReactSettingsPanel__footerLead">
                            <div className="configurationDialogReactSettingsPanel__exitHint">
                                途中で離れる場合はトップへ戻れます。ESC キーや背景クリックでは閉じません。
                            </div>
                            <a className="configurationDialogReactSettingsPanel__backLink" href="/">
                                トップへ戻る
                            </a>
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
                    </div>
                )}
            />
        </div>
    );
}
