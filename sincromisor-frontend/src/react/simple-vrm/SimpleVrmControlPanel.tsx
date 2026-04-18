import { PanelControls } from "./components/PanelControls";
import { DiagnosticsStatusCards } from "./components/DiagnosticsStatusCards";
import {
    SettingsCategorySection,
    BasicSettingsSection,
    MicSettingsSection,
    CharacterSettingsSection,
    LookingGlassSettingsSection,
    StartupSettingsSection,
} from "./components/SettingsSections";
import { panelStyles } from "./panelStyles";
import { useSimpleVrmPanelState } from "./useSimpleVrmPanelState";
import { UI_TUNING } from "../app/uiTuning";

type SimpleVrmControlPanelProps = {
    title?: string;
    variant?: "default" | "vrm360" | "looking-glass-vrm";
};

// simple-vrm / vrm360 / looking-glass-vrm で共通利用する設定/診断パネル。
// ページ差分は `variant` で吸収し、購読ロジックは useSimpleVrmPanelState に集約している。
export function SimpleVrmControlPanel({
    title = "設定パネル",
    variant = "default",
}: SimpleVrmControlPanelProps) {
    const controlPanelTuning = UI_TUNING.controlPanel;
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

    // connection_state は AppController 側で導出済みだが、detail がある場合だけ補助表示を足す。
    const effectiveConnectionState = connectionState.detail
        ? `${connectionState.value} (${connectionState.detail})`
        : connectionState.value;
    const isLookingGlassFocused = variant === "looking-glass-vrm";
    const lookingGlassStatusText = lookingGlass.code
        ? `${lookingGlass.state} [${lookingGlass.code}]`
        : lookingGlass.state;
    const canStartLookingGlass = lookingGlass.state !== "starting" && lookingGlass.state !== "active";
    const canStopLookingGlass = lookingGlass.state === "active" || lookingGlass.state === "starting";
    const openDeveloperConsole = (): void => {
        document.querySelector<HTMLButtonElement>("#debugConsoleToggle")?.click();
    };

    const requestLookingGlassStart = (): void => {
        // LG の実行/停止は Three.js 側 controller へ custom event で橋渡しする。
        // Control Panel は実行要求だけを出し、WebXR session の詳細を直接持たない。
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-start-request"));
    };

    const requestLookingGlassStop = (): void => {
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-stop-request"));
    };

    return (
        <section
            aria-label="設定パネル"
            className="sincroControlPanel"
            style={panelStyles.root}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "12px", letterSpacing: "0.02em" }}>{title}</strong>
                <span style={{ opacity: 0.8 }}>{hasActiveController ? "接続済み" : "待機中"}</span>
            </div>
            <div style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px`, opacity: 0.75, lineHeight: 1.35 }}>
                目的ごとに設定を分けています。まずは会話・音声・表示を調整し、接続確認や詳しい診断が必要な時だけ開発者向けを開いてください。
            </div>
            {isLookingGlassFocused ? (
                <SettingsCategorySection
                    title="Looking Glass 設定"
                    description="このページだけで使う立体表示の設定です。表示の見え方やセッション操作をここで調整します。"
                >
                    <div style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px` }}>
                        <div
                            style={{
                                display: "flex",
                                gap: `${controlPanelTuning.styles.controlsGapPx}px`,
                                marginBottom: "8px",
                            }}
                        >
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
                        <div style={{ opacity: 0.75, lineHeight: 1.35 }}>
                            現在の状態: {lookingGlassStatusText}
                            <br />
                            {lookingGlass.state === "recovering" ? "再試行できます。" : "設定変更はセッション終了後の再実行で反映されます。"}
                            {lookingGlass.state === "error" ? " エラー内容は開発者向け診断の LG コード / LG 詳細を確認してください。" : ""}
                        </div>
                    </div>
                    <BasicSettingsSection
                        settings={settings}
                        uiState={settingsUiState}
                        onTitleChange={(titleText) => applySettings({ titleText })}
                        onTalkModeChange={changeTalkMode}
                        showTitle={false}
                        showTalkMode={true}
                    />
                    <LookingGlassSettingsSection
                        settings={settings}
                        onApplySettings={applySettings}
                        showSectionTitle={false}
                    />
                </SettingsCategorySection>
            ) : null}
            {isLookingGlassFocused && lookingGlassConfigStatus.pendingForNextSession ? (
                // 実行中セッション中の変更か、次回開始で反映できる変更かを項目別に表示する。
                <div
                    style={{
                        marginBottom: `${controlPanelTuning.sectionSpacingPx}px`,
                        lineHeight: 1.35,
                        color: lookingGlassConfigStatus.reloadRecommended ? "#ffd38a" : "#b8e0ff",
                    }}
                >
                    {lookingGlassConfigStatus.reloadRecommended
                        ? "Looking Glass 設定はセッション開始後に変更されました。現在のセッションには反映されないため、セッション終了後に再実行してください。"
                        : "Looking Glass 設定は次回セッション開始時に反映されます。"}
                    {lookingGlassConfigStatus.reloadRecommendedKeys.length > 0
                        ? ` セッション終了後に再実行が必要な項目: ${lookingGlassConfigStatus.reloadRecommendedKeys.join(", ")}`
                        : ""}
                    {lookingGlassConfigStatus.nextSessionKeys.length > 0
                        ? ` 次回セッション反映項目: ${lookingGlassConfigStatus.nextSessionKeys.join(", ")}`
                        : ""}
                </div>
            ) : null}

            <PanelControls
                hasActiveController={hasActiveController}
                onStart={startAction}
                onStop={stopAction}
            />
            {!isLookingGlassFocused ? (
                <SettingsCategorySection
                    title="会話設定"
                    description="会話の見え方や進み方を調整します。ふだんの利用で最初に触ることが多い設定です。"
                >
                    <BasicSettingsSection
                        settings={settings}
                        uiState={settingsUiState}
                        onTitleChange={(titleText) => applySettings({ titleText })}
                        onTalkModeChange={changeTalkMode}
                        showTitle={true}
                        showTalkMode={true}
                    />
                </SettingsCategorySection>
            ) : null}
            <SettingsCategorySection
                title="音声設定"
                description="マイクの選択と、声の入り方に関わる調整をまとめています。"
                defaultOpen={!isLookingGlassFocused}
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
                />
            </SettingsCategorySection>
            <SettingsCategorySection
                title="表示設定"
                description="キャラクター表示や視線連動など、見た目や動きに関する設定です。"
                defaultOpen={!isLookingGlassFocused}
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
                />
            </SettingsCategorySection>
            {(!isLookingGlassFocused || startupSettingsCapabilities.enableTalk || startupSettingsCapabilities.enableInspector || startupSettingsCapabilities.enableVR) ? (
                <SettingsCategorySection
                    title="起動オプション"
                    description="ページを始める時にだけ効く設定です。反映したい時は停止してからもう一度始めてください。"
                    defaultOpen={false}
                >
                    <StartupSettingsSection
                        settings={settings}
                        uiState={settingsUiState}
                        onApplySettings={applySettings}
                        isRunning={lifecycleState === "running"}
                        startupStatus={startupSettingsStatus}
                        startupCapabilities={startupSettingsCapabilities}
                        hideIfNoSupported={false}
                        showSectionTitle={false}
                    />
                </SettingsCategorySection>
            ) : null}
            <SettingsCategorySection
                title="開発者向け"
                description="接続状態や診断情報を確認したい時だけ使います。通常の設定変更は上のカテゴリから行います。"
                defaultOpen={false}
            >
                <div style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px` }}>
                    <button type="button" onClick={openDeveloperConsole} style={panelStyles.button}>
                        開発者向け診断を開く
                    </button>
                </div>
                <div style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px` }}>
                    <div style={{ opacity: 0.75 }}>ライフサイクル</div>
                    <div style={{ fontSize: "13px" }}>{lifecycleState}</div>
                </div>
                <div style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px` }}>
                    <div style={{ opacity: 0.75 }}>接続状態</div>
                    <div style={{ fontSize: "13px" }}>{effectiveConnectionState}</div>
                </div>
                <div style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px` }}>
                    <div style={{ opacity: 0.75 }}>Looking Glass状態</div>
                    <div style={{ fontSize: "13px" }}>{lookingGlassStatusText}</div>
                </div>
                <details style={{ marginTop: `${controlPanelTuning.sectionSpacingPx}px` }}>
                    <summary style={{ cursor: "pointer", opacity: 0.85 }}>診断情報の詳細</summary>
                    <div style={{ marginTop: `${controlPanelTuning.detailsContentTopMarginPx}px` }}>
                        <DiagnosticsStatusCards
                            vadState={vadState}
                            gaze={gaze}
                            rtcState={rtcState}
                            learnedVad={learnedVad}
                            lookingGlass={lookingGlass}
                        />
                    </div>
                </details>
            </SettingsCategorySection>
        </section>
    );
}
