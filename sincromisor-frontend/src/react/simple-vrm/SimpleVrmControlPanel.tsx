import { DiagnosticsStatusCards } from "./components/DiagnosticsStatusCards";
import {
    BasicSettingsSection,
    CharacterSettingsSection,
    LookingGlassSettingsSection,
    MicSettingsSection,
    StartupSettingsSection,
} from "./components/SettingsSections";
import { panelStyles } from "./panelStyles";
import { useSimpleVrmPanelState } from "./useSimpleVrmPanelState";
import { SettingsShell, SettingsStatusCard, SettingsSummaryGrid } from "../settings-shell/SettingsShell";

type SimpleVrmControlPanelProps = {
    title?: string;
    variant?: "default" | "vrm360" | "looking-glass-vrm";
};

function connectionTone(value: string): "neutral" | "good" | "warn" {
    if (value === "connected") {
        return "good";
    }
    if (value === "idle" || value === "stopped") {
        return "neutral";
    }
    return "warn";
}

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

// simple-vrm / vrm360 / looking-glass-vrm 共通の常設設定パネル。
// Discord ライクなカテゴリナビで「探す場所」と「操作する場所」を揃え、接続操作は接続ページへ集約する。
export function SimpleVrmControlPanel({
    title = "設定パネル",
    variant = "default",
}: SimpleVrmControlPanelProps) {
    const {
        hasActiveController,
        lifecycleState,
        settings,
        settingsUiState,
        settingsUiHints,
        startupSettingsStatus,
        startupSettingsCapabilities,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        vadState,
        learnedVad,
        gaze,
        rtcState,
        connectionState,
        lookingGlass,
        lookingGlassConfigStatus,
        startAction,
        stopAction,
        applySettings,
        changeTalkMode,
        refreshDevices,
    } = useSimpleVrmPanelState();

    const isLookingGlassFocused = variant === "looking-glass-vrm";
    const hasStartupOptions =
        startupSettingsCapabilities.enableTalk
        || startupSettingsCapabilities.enableInspector
        || startupSettingsCapabilities.enableVR;
    const connectionDetail = connectionState.detail || (hasActiveController ? "接続済みです。" : "接続前の設定確認ができます。");
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
    const lookingGlassStatusText = lookingGlass.code
        ? `${lookingGlass.state} [${lookingGlass.code}]`
        : lookingGlass.state;
    const canStartLookingGlass = lookingGlass.state !== "starting" && lookingGlass.state !== "active";
    const canStopLookingGlass = lookingGlass.state === "active" || lookingGlass.state === "starting";
    const openDeveloperConsole = (): void => {
        document.querySelector<HTMLButtonElement>("#debugConsoleToggle")?.click();
    };
    const requestLookingGlassStart = (): void => {
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-start-request"));
    };
    const requestLookingGlassStop = (): void => {
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-stop-request"));
    };

    return (
        <section aria-label="設定パネル" className="sincroControlPanel" style={panelStyles.root}>
            <SettingsShell
                ariaLabel="一般ユーザー向け設定"
                badge="一般ユーザー向け設定"
                title={title}
                description="会話・音声・表示・起動・接続を同じ分類で整理しています。通常の調整はここから行い、詳しい診断が必要な時だけ開発者向けを開いてください。"
                initialPageId={isLookingGlassFocused ? "looking-glass" : "conversation"}
                pages={[
                    ...(isLookingGlassFocused ? [{
                        id: "looking-glass",
                        label: "Looking Glass",
                        title: "Looking Glass",
                        description: "このページだけで使う立体表示の設定です。セッション操作と見え方調整をここへまとめています。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="セッション状態"
                                    value={lookingGlassStatusText}
                                    detail={lookingGlass.message || "設定変更はセッション終了後の再実行で反映されます。"}
                                    tone={lookingGlass.state === "active" ? "good" : lookingGlass.state === "error" ? "warn" : "neutral"}
                                />
                                <SettingsStatusCard
                                    label="反映タイミング"
                                    value={lookingGlassConfigStatus.reloadRecommended ? "再実行が必要" : lookingGlassConfigStatus.pendingForNextSession ? "次回セッションで反映" : "最新状態"}
                                    detail={lookingGlassConfigStatus.changedKeys.length > 0 ? lookingGlassConfigStatus.changedKeys.join(", ") : "未反映の変更はありません。"}
                                    tone={lookingGlassConfigStatus.reloadRecommended ? "warn" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <>
                                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                                    <button
                                        type="button"
                                        onClick={requestLookingGlassStart}
                                        disabled={!canStartLookingGlass}
                                        style={panelStyles.button}
                                    >
                                        Looking Glass 開始
                                    </button>
                                    <button
                                        type="button"
                                        onClick={requestLookingGlassStop}
                                        disabled={!canStopLookingGlass}
                                        style={panelStyles.button}
                                    >
                                        Looking Glass 停止
                                    </button>
                                </div>
                                <BasicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onTitleChange={(titleText) => applySettings({ titleText })}
                                    onTalkModeChange={changeTalkMode}
                                    showTitle={false}
                                    showTalkMode={true}
                                    showSectionTitle={false}
                                />
                                <LookingGlassSettingsSection
                                    settings={settings}
                                    onApplySettings={applySettings}
                                    showSectionTitle={false}
                                />
                            </>
                        ),
                    }] : []),
                    ...(!isLookingGlassFocused ? [{
                        id: "conversation",
                        label: "会話",
                        title: "会話",
                        description: "会話の見え方や進み方を調整します。ふだんの利用で最初に触ることが多い設定です。",
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
                            <BasicSettingsSection
                                settings={settings}
                                uiState={settingsUiState}
                                onTitleChange={(titleText) => applySettings({ titleText })}
                                onTalkModeChange={changeTalkMode}
                                showTitle={true}
                                showTalkMode={true}
                                showSectionTitle={false}
                            />
                        ),
                    }] : []),
                    {
                        id: "audio",
                        label: "音声",
                        title: "音声",
                        description: "マイクの選択と、声の入り方に関わる調整をまとめています。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="マイク"
                                    value={microphoneValue}
                                    detail={settingsUiHints.audioInputDeviceReason ?? "開始後もこのマイク設定を使います。"}
                                    tone={audioInputSelection.isSelected && !audioInputSelection.isAvailable ? "warn" : "neutral"}
                                />
                                <SettingsStatusCard
                                    label="一覧状態"
                                    value={mediaDeviceSnapshot.isRefreshing ? "更新中" : "確認可能"}
                                    detail={mediaDeviceSnapshot.refreshError ?? "デバイス再読み込みもこのページから行えます。"}
                                    tone={mediaDeviceSnapshot.refreshError ? "warn" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <MicSettingsSection
                                settings={settings}
                                uiState={settingsUiState}
                                uiHints={settingsUiHints}
                                mediaDeviceSnapshot={mediaDeviceSnapshot}
                                audioInputSelection={audioInputSelection}
                                onApplySettings={applySettings}
                                onRefreshDevices={refreshDevices}
                                showSectionTitle={false}
                            />
                        ),
                    },
                    {
                        id: "display",
                        label: "表示",
                        title: "表示",
                        description: "キャラクター表示や視線連動など、見た目や動きに関する設定です。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="3Dキャラクター"
                                    value={settings.enableCharacter ? "表示する" : "表示しない"}
                                    detail={settingsUiHints.enableCharacterReason ?? "負荷を下げたい時はオフにできます。"}
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
                            <CharacterSettingsSection
                                settings={settings}
                                uiState={settingsUiState}
                                uiHints={settingsUiHints}
                                mediaDeviceSnapshot={mediaDeviceSnapshot}
                                audioInputSelection={audioInputSelection}
                                videoInputSelection={videoInputSelection}
                                onApplySettings={applySettings}
                                onRefreshDevices={refreshDevices}
                                showSectionTitle={false}
                            />
                        ),
                    },
                    ...(hasStartupOptions ? [{
                        id: "startup",
                        label: "起動",
                        title: "起動",
                        description: "ページを始める時にだけ効く設定です。反映したい時は停止してからもう一度始めてください。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="反映タイミング"
                                    value={startupSettingsStatus.requiresRestart ? "再開始が必要" : startupSettingsStatus.willApplyOnNextStart ? "次回開始で反映" : "最新状態"}
                                    detail={startupSettingsStatus.changedKeys.length > 0 ? `変更中: ${startupSettingsStatus.changedKeys.join(", ")}` : "開始前に決まる動きをまとめています。"}
                                    tone={startupSettingsStatus.requiresRestart ? "warn" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <StartupSettingsSection
                                settings={settings}
                                uiState={settingsUiState}
                                onApplySettings={applySettings}
                                isRunning={lifecycleState === "running"}
                                startupStatus={startupSettingsStatus}
                                startupCapabilities={startupSettingsCapabilities}
                                hideIfNoSupported={true}
                                showSectionTitle={false}
                            />
                        ),
                    }] : []),
                    {
                        id: "connection",
                        label: "接続",
                        title: "接続",
                        description: "接続状態の確認と開始・停止操作をここにまとめています。設定項目と接続アクションを分けて迷いを減らします。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="接続状態"
                                    value={connectionState.value}
                                    detail={connectionDetail}
                                    tone={connectionTone(connectionState.value)}
                                />
                                <SettingsStatusCard
                                    label="RTC 状態"
                                    value={`${rtcState.iceConnectionState} / ${rtcState.signalingState}`}
                                    detail="ICE と signaling の要約です。詳細診断は開発者向けで確認できます。"
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <div style={{ display: "grid", gap: "12px" }}>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button type="button" onClick={startAction} disabled={!hasActiveController} style={panelStyles.button}>
                                        会話を開始
                                    </button>
                                    <button type="button" onClick={stopAction} disabled={!hasActiveController} style={panelStyles.button}>
                                        接続を停止
                                    </button>
                                </div>
                                <div style={{ opacity: 0.72, lineHeight: 1.4 }}>
                                    接続状態が不安定な時は、ここで停止してからもう一度開始してください。詳しい原因確認が必要な時は開発者向けを使います。
                                </div>
                            </div>
                        ),
                    },
                    {
                        id: "developer",
                        label: "開発者向け",
                        title: "開発者向け",
                        description: "接続状態や診断情報を確認したい時だけ使います。通常の設定変更は他のカテゴリから行います。",
                        tone: "developer",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="ライフサイクル"
                                    value={lifecycleState}
                                    detail="UI と RTC の大まかな状態です。"
                                />
                                <SettingsStatusCard
                                    label="Looking Glass"
                                    value={lookingGlassStatusText}
                                    detail={lookingGlass.message || "対象ページでない場合も状態だけ表示します。"}
                                    tone={lookingGlass.state === "error" ? "warn" : lookingGlass.state === "active" ? "good" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <>
                                <div style={{ marginBottom: "14px" }}>
                                    <button type="button" onClick={openDeveloperConsole} style={panelStyles.button}>
                                        開発者向け診断へ切り替える
                                    </button>
                                    <div style={{ marginTop: "6px", opacity: 0.68, lineHeight: 1.35 }}>
                                        診断画面を開くと、この設定パネルは閉じて同じ右側ツール領域に切り替わります。
                                    </div>
                                </div>
                                <DiagnosticsStatusCards
                                    vadState={vadState}
                                    gaze={gaze}
                                    rtcState={rtcState}
                                    learnedVad={learnedVad}
                                    lookingGlass={lookingGlass}
                                />
                            </>
                        ),
                    },
                ]}
            />
        </section>
    );
}
