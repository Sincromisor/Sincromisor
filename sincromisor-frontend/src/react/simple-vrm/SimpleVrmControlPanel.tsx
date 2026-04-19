import { DiagnosticsStatusCards } from "./components/DiagnosticsStatusCards";
import {
    BasicSettingsSection,
    CharacterSettingsSection,
    LookingGlassSettingsSection,
    MicSettingsSection,
    SettingsCategorySection,
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
// カテゴリナビで「探す場所」と「操作する場所」を揃え、接続操作は接続ページへ集約する。
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
    const audioProcessingLabels = [
        settings.enableNoiseSuppression ? "ノイズ抑制" : null,
        settings.enableEchoCancellation ? "回り込み抑制" : null,
        settings.enableAutoGainControl ? "自動音量調整" : null,
        settings.enableVenueNoiseMode ? "会場向け調整" : null,
    ].filter((label): label is string => label !== null);
    const audioProcessingValue = audioProcessingLabels.length > 0 ? `${audioProcessingLabels.length}項目を調整中` : "既定のまま";
    const audioProcessingDetail = audioProcessingLabels.length > 0
        ? audioProcessingLabels.join(" / ")
        : "ノイズが気になる時だけ補正を有効にしてください。";
    const speechGateValue = settings.enableVadGate ? "無音時は送信を抑える" : "常に送信する";
    const displayModeValue = settings.enableCharacter ? "3Dキャラクターを表示" : "表示しない";
    const gazeModeValue = settings.enableCharacterGaze ? "顔の向きを使う" : "顔の向きを使わない";
    const autoMuteDetail = settings.enableAutoMute ? "自動ミュートも有効です。" : "自動ミュートは使いません。";
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
    const startupSummaryValue = startupSettingsStatus.requiresRestart
        ? "再開始が必要"
        : startupSettingsStatus.willApplyOnNextStart
            ? "次回開始で反映"
            : hasStartupOptions
                ? "開始前の準備は最新です"
                : "追加の開始準備はありません";
    const startupSummaryDetail = startupSettingsStatus.changedKeys.length > 0
        ? `変更中: ${startupSettingsStatus.changedKeys.join(", ")}`
        : hasStartupOptions
            ? "開始時だけ効く項目は接続ページでまとめて確認できます。"
            : "このページでは接続状態と開始・停止だけを確認します。";
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
                            <SettingsCategorySection
                                title="会話の基本"
                                description="表示名と会話の進み方をここで決めます。開始後も同じ分類で見直せます。"
                            >
                                <BasicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onTitleChange={(titleText) => applySettings({ titleText })}
                                    onTalkModeChange={changeTalkMode}
                                    showTitle={true}
                                    showTalkMode={true}
                                    showSectionTitle={false}
                                />
                            </SettingsCategorySection>
                        ),
                    }] : []),
                    {
                        id: "devices",
                        label: "入出力デバイス",
                        title: "入出力デバイス",
                        description: "会話に使うマイクと、視線連動に使うカメラを同じ場所で確認します。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="マイク"
                                    value={microphoneValue}
                                    detail={settingsUiHints.audioInputDeviceReason ?? "開始後もこのマイク設定を使います。"}
                                    tone={audioInputSelection.isSelected && !audioInputSelection.isAvailable ? "warn" : "neutral"}
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
                            <SettingsCategorySection
                                title="使うデバイス"
                                description="マイクと視線用カメラをここで選びます。デバイス一覧の再読み込みも同じ場所から行えます。"
                            >
                                <MicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    uiHints={settingsUiHints}
                                    mediaDeviceSnapshot={mediaDeviceSnapshot}
                                    audioInputSelection={audioInputSelection}
                                    onApplySettings={applySettings}
                                    onRefreshDevices={refreshDevices}
                                    showSectionTitle={false}
                                    mode="device"
                                />
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
                                    mode="camera"
                                />
                            </SettingsCategorySection>
                        ),
                    },
                    {
                        id: "audio",
                        label: "音声",
                        title: "音声",
                        description: "声の入り方や無音時の扱いなど、会話音声の調整だけをまとめています。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="入力補正"
                                    value={audioProcessingValue}
                                    detail={audioProcessingDetail}
                                />
                                <SettingsStatusCard
                                    label="話していない時"
                                    value={speechGateValue}
                                    detail="反応が多い環境では、無音時の送信抑制を有効にすると落ち着きやすくなります。"
                                    tone={settings.enableVadGate ? "good" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <SettingsCategorySection
                                title="マイク前処理"
                                description="周囲のノイズや反響に合わせて、声の拾い方を調整します。迷った時は既定値から少しずつ切り替えてください。"
                            >
                                <MicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    uiHints={settingsUiHints}
                                    mediaDeviceSnapshot={mediaDeviceSnapshot}
                                    audioInputSelection={audioInputSelection}
                                    onApplySettings={applySettings}
                                    onRefreshDevices={refreshDevices}
                                    showSectionTitle={false}
                                    mode="processing"
                                />
                            </SettingsCategorySection>
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
                                    value={displayModeValue}
                                    detail={settingsUiHints.enableCharacterReason ?? "負荷を下げたい時はオフにできます。"}
                                    tone={settings.enableCharacter ? "good" : "neutral"}
                                />
                                <SettingsStatusCard
                                    label="視線連動"
                                    value={gazeModeValue}
                                    detail={settingsUiHints.enableCharacterGazeReason ?? autoMuteDetail}
                                    tone={settings.enableCharacterGaze ? "good" : "neutral"}
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <SettingsCategorySection
                                title="キャラクター表示"
                                description="3D表示、顔の向き連動、自動ミュートなど見た目とふるまいをまとめて調整します。"
                            >
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
                                    mode="display"
                                />
                            </SettingsCategorySection>
                        ),
                    },
                    {
                        id: "connection",
                        label: "接続",
                        title: "接続",
                        description: "接続状態の確認と開始・停止操作をここにまとめています。開始時だけ効く項目もこの面で扱います。",
                        summary: (
                            <SettingsSummaryGrid>
                                <SettingsStatusCard
                                    label="接続状態"
                                    value={connectionStatusLabel(connectionState.value)}
                                    detail={connectionDetail}
                                    tone={connectionTone(connectionState.value)}
                                />
                                <SettingsStatusCard
                                    label="開始時の準備"
                                    value={startupSummaryValue}
                                    detail={startupSummaryDetail}
                                    tone={startupSettingsStatus.requiresRestart ? "warn" : "neutral"}
                                />
                                <SettingsStatusCard
                                    label="RTC 状態"
                                    value={`${rtcState.iceConnectionState} / ${rtcState.signalingState}`}
                                    detail="ICE と signaling の要約です。詳細診断は開発者向けで確認できます。"
                                />
                            </SettingsSummaryGrid>
                        ),
                        content: (
                            <>
                                {hasStartupOptions ? (
                                    <SettingsCategorySection
                                        title="開始時のオプション"
                                        description="ページを始める瞬間にだけ効く項目です。変更したあと反映タイミングもこの中で確認できます。"
                                    >
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
                                    </SettingsCategorySection>
                                ) : null}
                                <SettingsCategorySection
                                    title="接続操作"
                                    description="状態確認と開始・停止をこの面にまとめています。設定値の変更と接続アクションを混在させないための専用ページです。"
                                >
                                    <div style={{ display: "grid", gap: "14px" }}>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <button type="button" onClick={startAction} disabled={!hasActiveController} style={panelStyles.button}>
                                                会話を開始
                                            </button>
                                            <button type="button" onClick={stopAction} disabled={!hasActiveController} style={panelStyles.button}>
                                                接続を停止
                                            </button>
                                        </div>
                                        <div style={{ opacity: 0.78, lineHeight: 1.5 }}>
                                            接続状態が不安定な時は、ここで停止してからもう一度開始してください。詳しい原因確認が必要な時は開発者向けを使います。
                                        </div>
                                    </div>
                                </SettingsCategorySection>
                            </>
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
                                <SettingsCategorySection
                                    title="診断画面"
                                    description="より詳しい RTC や音声の状態を確認したい時だけ切り替えます。通常の調整は他カテゴリのまま進めてください。"
                                >
                                    <div style={{ marginBottom: "4px" }}>
                                        <button type="button" onClick={openDeveloperConsole} style={panelStyles.button}>
                                            開発者向け診断へ切り替える
                                        </button>
                                        <div style={{ marginTop: "8px", opacity: 0.72, lineHeight: 1.45 }}>
                                            診断画面を開くと、この設定パネルは閉じて同じ右側ツール領域に切り替わります。
                                        </div>
                                    </div>
                                </SettingsCategorySection>
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
