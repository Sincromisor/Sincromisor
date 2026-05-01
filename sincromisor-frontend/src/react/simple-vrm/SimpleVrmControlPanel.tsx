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
import { showRightToolDebugPanel } from "../app/useRightToolPanelState";

type SimpleVrmControlPanelProps = {
    title?: string;
    variant?: "default" | "vrm360" | "looking-glass-vrm";
};

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
    const lookingGlassStatusText = lookingGlass.code
        ? `${lookingGlass.state} [${lookingGlass.code}]`
        : lookingGlass.state;
    const canStartLookingGlass = lookingGlass.state !== "starting" && lookingGlass.state !== "active";
    const canStopLookingGlass = lookingGlass.state === "active" || lookingGlass.state === "starting";
    const startupOptionHint = startupSettingsStatus.changedKeys.length > 0
        ? `開始前だけ効く項目に変更があります: ${startupSettingsStatus.changedKeys.join(", ")}`
        : hasStartupOptions
            ? "開始前だけ効く項目は、必要な時だけこのページで調整します。"
            : "このページでは接続状態と開始・停止だけを確認します。";
    const openDeveloperConsole = (): void => {
        showRightToolDebugPanel();
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
                description="会話・入出力デバイス・音声・表示・接続を同じ分類で整理しています。通常の調整はここから行い、詳しい原因確認が必要な時だけ診断へ切り替えます。"
                responsiveMode="container"
                navigationDensity="compact"
                initialPageId={isLookingGlassFocused ? "looking-glass" : "conversation"}
                pages={[
                    ...(isLookingGlassFocused ? [{
                        id: "looking-glass",
                        label: "Looking Glass",
                        title: "Looking Glass",
                        description: "このページだけで使う立体表示の設定です。セッション操作と見え方調整をここへまとめています。",
                        content: (
                            <>
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
                        label: "デバイス",
                        title: "入出力デバイス",
                        description: "会話に使うマイクと、視線連動に使うカメラを同じ場所で確認します。",
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
                        description: "キャラクター表示や視線連動のオンオフなど、見た目や動きに関する設定です。",
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
                        description: "接続状態の確認と開始・停止操作をここにまとめています。開始前だけ効く項目がある時だけ、このページで扱います。",
                        content: (
                            <>
                                {hasStartupOptions ? (
                                    <SettingsCategorySection
                                        title="開始前だけ効く項目"
                                        description="会話を始める瞬間にだけ反映される項目です。必要な時だけここで調整します。"
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
                                    description="接続状態を見ながら、必要なら開始・停止だけをここで行います。設定変更は他のカテゴリで済ませてから戻ってきます。"
                                >
                                    <div style={{ display: "grid", gap: "14px" }}>
                                        <div
                                            style={{
                                                display: "grid",
                                                gap: "6px",
                                                padding: "12px 14px",
                                                borderRadius: "12px",
                                                border: "1px solid rgba(157, 176, 204, 0.14)",
                                                background: "rgba(255,255,255,0.03)",
                                            }}
                                        >
                                            <div style={{ opacity: 0.66, fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                                現在の状態
                                            </div>
                                            <div style={{ fontWeight: 700, lineHeight: 1.3 }}>
                                                {connectionStatusLabel(connectionState.value)}
                                            </div>
                                            <div style={{ opacity: 0.78, lineHeight: 1.45 }}>
                                                {connectionDetail}
                                            </div>
                                            <div style={{ opacity: 0.72, lineHeight: 1.45 }}>
                                                {startupOptionHint}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <button type="button" onClick={startAction} disabled={!hasActiveController} style={panelStyles.button}>
                                                会話を開始
                                            </button>
                                            <button type="button" onClick={stopAction} disabled={!hasActiveController} style={panelStyles.button}>
                                                接続を停止
                                            </button>
                                        </div>
                                        <div style={{ opacity: 0.78, lineHeight: 1.5 }}>
                                            接続状態が不安定な時は、ここで停止してからもう一度開始してください。詳しい原因確認が必要な時は、同じ右側ツール領域で診断へ切り替えられます。
                                        </div>
                                        <div
                                            style={{
                                                display: "grid",
                                                gap: "8px",
                                                padding: "12px 14px",
                                                borderRadius: "12px",
                                                border: "1px solid rgba(157, 176, 204, 0.14)",
                                                background: "rgba(255,255,255,0.025)",
                                            }}
                                        >
                                            <div style={{ opacity: 0.78, lineHeight: 1.5 }}>
                                                ICE や音声レベルなどの詳しい値を確認したい場合だけ、診断画面を開いてください。
                                            </div>
                                            <div>
                                                <button type="button" onClick={openDeveloperConsole} style={{ ...panelStyles.button, flex: "0 0 auto" }}>
                                                    詳しい診断を開く
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </SettingsCategorySection>
                            </>
                        ),
                    },
                ]}
            />
        </section>
    );
}
