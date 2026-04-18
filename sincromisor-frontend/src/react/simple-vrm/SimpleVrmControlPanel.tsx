import { PanelControls } from "./components/PanelControls";
import { DiagnosticsStatusCards } from "./components/DiagnosticsStatusCards";
import {
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
                <div style={{ fontSize: "13px" }}>
                    {lookingGlassStatusText}
                </div>
            </div>
            {isLookingGlassFocused ? (
                // LG ページでは start/stop 導線を Control Panel に寄せる（Debug Console 依存を避ける）。
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
                        {lookingGlass.state === "recovering" ? "再試行できます。" : "設定変更はセッション終了後の再実行で反映されます。"}
                        {lookingGlass.state === "error" ? " エラー内容は下の診断情報（LGコード / LG詳細）を確認してください。" : ""}
                    </div>
                </div>
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
            <BasicSettingsSection
                settings={settings}
                uiState={settingsUiState}
                onTitleChange={(titleText) => applySettings({ titleText })}
                onTalkModeChange={changeTalkMode}
                showTitle={!isLookingGlassFocused}
                showTalkMode={!isLookingGlassFocused}
            />
            {isLookingGlassFocused ? (
                // LGページでは talk mode を LG 設定の近くに置き、用途切替を見つけやすくする。
                <BasicSettingsSection
                    settings={settings}
                    uiState={settingsUiState}
                    onTitleChange={(titleText) => applySettings({ titleText })}
                    onTalkModeChange={changeTalkMode}
                    showTitle={false}
                    showTalkMode={true}
                />
            ) : null}
            {isLookingGlassFocused ? (
                // LG向けページでは Looking Glass 設定を最前面に置き、実機調整の導線を優先する。
                <LookingGlassSettingsSection
                    settings={settings}
                    onApplySettings={applySettings}
                />
            ) : null}
            {isLookingGlassFocused ? (
                // LG向けページでは利用頻度の低い一般設定を折りたたみへ退避する。
                <details style={{ marginBottom: `${controlPanelTuning.sectionSpacingPx}px` }}>
                    <summary style={{ cursor: "pointer", opacity: 0.85 }}>音声 / キャラクター設定（詳細）</summary>
                    <div style={{ marginTop: `${controlPanelTuning.detailsContentTopMarginPx}px` }}>
                        <MicSettingsSection
                            settings={settings}
                            uiState={settingsUiState}
                            uiHints={settingsUiHints}
                            mediaDeviceSnapshot={mediaDeviceSnapshot}
                            audioInputSelection={audioInputSelection}
                            onApplySettings={applySettings}
                            onRefreshDevices={refreshDevices}
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
                        />
                    </div>
                </details>
            ) : (
                <>
                    <MicSettingsSection
                        settings={settings}
                        uiState={settingsUiState}
                        uiHints={settingsUiHints}
                        mediaDeviceSnapshot={mediaDeviceSnapshot}
                        audioInputSelection={audioInputSelection}
                        onApplySettings={applySettings}
                        onRefreshDevices={refreshDevices}
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
                    />
                </>
            )}
            <StartupSettingsSection
                settings={settings}
                uiState={settingsUiState}
                onApplySettings={applySettings}
                isRunning={lifecycleState === "running"}
                startupStatus={startupSettingsStatus}
                startupCapabilities={startupSettingsCapabilities}
                hideIfNoSupported={isLookingGlassFocused}
            />

            <details style={{ marginTop: `${controlPanelTuning.sectionSpacingPx}px` }}>
                {/* 通常利用の導線を邪魔しないよう、診断情報は折りたたみへ寄せる。 */}
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>診断情報</summary>
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
        </section>
    );
}
