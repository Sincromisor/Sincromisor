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
import { settingsPageCopy } from "../settings-shell/settingsPageCopy";

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
    title = "基本設定",
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
    const hasStartupOptions = startupSettingsCapabilities.enableVR;
    const connectionDetail = connectionState.detail || (hasActiveController ? "接続済みです。" : "");
    const lookingGlassStatusText = lookingGlass.code
        ? `${lookingGlass.state} [${lookingGlass.code}]`
        : lookingGlass.state;
    const canStartLookingGlass = lookingGlass.state !== "starting" && lookingGlass.state !== "active";
    const canStopLookingGlass = lookingGlass.state === "active" || lookingGlass.state === "starting";
    const startupOptionHint = startupSettingsStatus.changedKeys.length > 0
        ? `開始前だけ効く項目に変更があります: ${startupSettingsStatus.changedKeys.join(", ")}`
        : "";
    const lookingGlassApplyLabel = lookingGlassConfigStatus.reloadRecommended
        ? "停止後に反映"
        : lookingGlassConfigStatus.pendingForNextSession
            ? "次回起動で反映"
            : "最新状態";
    const lookingGlassApplyDetail = lookingGlassConfigStatus.reloadRecommended
        ? "停止してから Looking Glass をもう一度開始すると反映されます。"
        : lookingGlassConfigStatus.changedKeys.length > 0
            ? lookingGlassConfigStatus.changedKeys.join(", ")
            : null;
    const requestLookingGlassStart = (): void => {
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-start-request"));
    };
    const requestLookingGlassStop = (): void => {
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-stop-request"));
    };

    return (
        <section aria-label="基本設定" className="sincroControlPanel" style={panelStyles.root}>
            <SettingsShell
                ariaLabel="一般ユーザー向け設定"
                title={title}
                responsiveMode="container"
                navigationDensity="compact"
                navigationPlacement="top"
                initialPageId={isLookingGlassFocused ? "looking-glass" : "conversation"}
                pages={[
                    ...(isLookingGlassFocused ? [{
                        id: "looking-glass",
                        label: settingsPageCopy.lookingGlass.label,
                        title: settingsPageCopy.lookingGlass.title,
                        content: (
                            <>
                                <SettingsSummaryGrid>
                                    <SettingsStatusCard
                                        label="表示状態"
                                        value={lookingGlassStatusText}
                                        detail={lookingGlass.message || null}
                                        tone={lookingGlass.state === "active" ? "good" : lookingGlass.state === "error" ? "warn" : "neutral"}
                                    />
                                    <SettingsStatusCard
                                        label="反映タイミング"
                                        value={lookingGlassApplyLabel}
                                        detail={lookingGlassApplyDetail}
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
                        label: settingsPageCopy.conversation.label,
                        title: settingsPageCopy.conversation.title,
                        content: (
                            <SettingsCategorySection
                                title={settingsPageCopy.conversation.sectionTitle}
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
                        label: settingsPageCopy.devices.label,
                        title: settingsPageCopy.devices.title,
                        content: (
                            <SettingsCategorySection
                                title={settingsPageCopy.devices.sectionTitle}
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
                        label: settingsPageCopy.audio.label,
                        title: settingsPageCopy.audio.title,
                        description: settingsPageCopy.audio.description,
                        content: (
                            <SettingsCategorySection title={settingsPageCopy.audio.sectionTitle}>
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
                        label: settingsPageCopy.display.label,
                        title: settingsPageCopy.display.title,
                        content: (
                            <SettingsCategorySection title={settingsPageCopy.display.sectionTitle}>
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
                        label: settingsPageCopy.connection.label,
                        title: settingsPageCopy.connection.title,
                        description: settingsPageCopy.connection.description,
                        content: (
                            <>
                                {hasStartupOptions ? (
                                    <SettingsCategorySection
                                        title={settingsPageCopy.connection.startupSectionTitle}
                                    >
                                        <StartupSettingsSection
                                            settings={settings}
                                            uiState={settingsUiState}
                                            onApplySettings={applySettings}
                                            isRunning={lifecycleState === "running"}
                                            startupStatus={startupSettingsStatus}
                                            startupCapabilities={startupSettingsCapabilities}
                                            showSectionTitle={false}
                                        />
                                    </SettingsCategorySection>
                                ) : null}
                                <SettingsCategorySection
                                    title={settingsPageCopy.connection.statusSectionTitle}
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
                                            <div style={{ fontWeight: 700, lineHeight: 1.3 }}>
                                                {connectionStatusLabel(connectionState.value)}
                                            </div>
                                            {connectionDetail ? <div style={{ opacity: 0.78, lineHeight: 1.45 }}>
                                                {connectionDetail}
                                            </div> : null}
                                            {startupOptionHint ? <div style={{ opacity: 0.72, lineHeight: 1.45 }}>
                                                {startupOptionHint}
                                            </div> : null}
                                        </div>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <button type="button" onClick={startAction} disabled={!hasActiveController} style={panelStyles.button}>
                                                会話を開始
                                            </button>
                                            <button type="button" onClick={stopAction} disabled={!hasActiveController} style={panelStyles.button}>
                                                接続を停止
                                            </button>
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
