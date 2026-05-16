import type { ReactNode } from "react";
import { useState } from "react";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../../ts/MediaDevices/SincroMediaDeviceService";
import { UI_TUNING } from "../../app/uiTuning";
import {
    AudioInputDeviceField,
    AudioProcessingToggles,
    CharacterDisplayToggles,
    StartupBehaviorFields,
    settingHelp,
    TalkModeField,
    TitleTextField,
    VideoInputDeviceField,
} from "../../settings-fields/SettingsFields";
import {
    SettingsButton,
    SettingsHelpBadge,
    SettingsHelpLabel,
    SettingsInput,
    SettingsSectionCard,
} from "../../settings-primitives/SettingsPrimitives";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../panelTypes";

// Control Panel 用の設定セクション群。
// 起動前 dialog 用フォームとは分離し、ページ常設パネル向けの文言/密度/導線をここで管理する。
const sectionSpacingPx = UI_TUNING.controlPanel.sectionSpacingPx;
const detailsContentTopMarginPx = UI_TUNING.controlPanel.detailsContentTopMarginPx;
const settingsTuning = UI_TUNING.controlPanel.settings;
const compactGapPx = settingsTuning.compactGapPx;
const rowGapPx = settingsTuning.rowGapPx;

const HelpBadge = SettingsHelpBadge;
const HelpLabel = SettingsHelpLabel;

type SettingsCategorySectionProps = {
    title?: string;
    description?: string;
    children: ReactNode;
    defaultOpen?: boolean;
};

export function SettingsCategorySection({
    title,
    description,
    children,
    defaultOpen = true,
}: SettingsCategorySectionProps) {
    return (
        <SettingsSectionCard
            title={title}
            description={description}
            className={defaultOpen ? undefined : "is-collapsed"}
        >
            {children}
        </SettingsSectionCard>
    );
}

type BasicSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onTitleChange: (titleText: string) => void;
    onTalkModeChange: (talkMode: string) => void;
    showTitle?: boolean;
    showTalkMode?: boolean;
    showSectionTitle?: boolean;
};

export function BasicSettingsSection({
    settings,
    uiState,
    onTitleChange,
    onTalkModeChange,
    showTitle = true,
    showTalkMode = true,
    showSectionTitle = false,
}: BasicSettingsSectionProps) {
    if (!showTitle && !showTalkMode) {
        // variant 側で表示対象を完全に外した場合は空描画にする。
        return null;
    }
    return (
        <>
            {showSectionTitle ? <HelpLabel text="会話設定" /> : null}
            {showTitle ? (
                <TitleTextField
                    settings={settings}
                    uiState={uiState}
                    onTitleChange={onTitleChange}
                    style={{
                        marginTop: `${detailsContentTopMarginPx}px`,
                        marginBottom: `${sectionSpacingPx}px`,
                    }}
                />
            ) : null}
            {showTalkMode ? (
                <TalkModeField
                    settings={settings}
                    uiState={uiState}
                    onTalkModeChange={onTalkModeChange}
                    style={{ marginBottom: `${sectionSpacingPx}px` }}
                />
            ) : null}
        </>
    );
}

type SettingsApplyProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onApplySettings: ApplySettingsFn;
};

type DeviceSettingsProps = SettingsApplyProps & {
    uiHints: SincroAppSettingsUiHints;
    mediaDeviceSnapshot: SincroMediaDeviceSnapshot;
    audioInputSelection: SincroMediaDeviceSelectionState;
    onRefreshDevices: () => Promise<SincroMediaDeviceSnapshot>;
    showSectionTitle?: boolean;
};

type MicSettingsSectionMode = "full" | "device" | "processing";

export function MicSettingsSection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    audioInputSelection,
    onApplySettings,
    onRefreshDevices,
    showSectionTitle = true,
    mode = "full",
}: DeviceSettingsProps & { mode?: MicSettingsSectionMode }) {
    const [refreshMessage, setRefreshMessage] = useState<string>("");
    const showDeviceSelection = mode !== "processing";
    const showProcessingOptions = mode !== "device";

    const handleRefreshDevices = () => {
        setRefreshMessage("");
        void onRefreshDevices().then((nextSnapshot) => {
            if (nextSnapshot.refreshError) {
                setRefreshMessage(
                    `デバイス一覧の再取得に失敗しました: ${nextSnapshot.refreshError}`,
                );
                return;
            }
            setRefreshMessage("デバイス一覧を更新しました。");
        });
    };

    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showDeviceSelection ? (
                <>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: `${compactGapPx}px`,
                            marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                        }}
                    >
                        {showSectionTitle ? (
                            <HelpLabel text="マイク設定" />
                        ) : (
                            <span style={{ opacity: 0.8, fontWeight: 700 }}>マイク入力</span>
                        )}
                        <SettingsButton
                            type="button"
                            onClick={handleRefreshDevices}
                            disabled={mediaDeviceSnapshot.isRefreshing}
                        >
                            {mediaDeviceSnapshot.isRefreshing ? "更新中..." : "再読み込み"}
                        </SettingsButton>
                    </div>
                    <div
                        style={{
                            marginBottom: showProcessingOptions ? `${sectionSpacingPx}px` : "0",
                        }}
                    >
                        <AudioInputDeviceField
                            settings={settings}
                            uiState={uiState}
                            uiHints={uiHints}
                            snapshot={mediaDeviceSnapshot}
                            selection={audioInputSelection}
                            onApplySettings={onApplySettings}
                        />
                    </div>
                </>
            ) : null}
            {showProcessingOptions ? (
                <AudioProcessingToggles
                    settings={settings}
                    uiState={uiState}
                    onApplySettings={onApplySettings}
                />
            ) : null}
            {refreshMessage ? (
                <div
                    style={{
                        marginTop: `${settingsTuning.hintMarginTopPx}px`,
                        opacity: 0.7,
                        lineHeight: 1.3,
                    }}
                >
                    {refreshMessage}
                </div>
            ) : null}
        </div>
    );
}

type CharacterSettingsSectionProps = DeviceSettingsProps & {
    videoInputSelection: SincroMediaDeviceSelectionState;
};

type CharacterSettingsSectionMode = "full" | "camera" | "display";

export function CharacterSettingsSection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    videoInputSelection,
    onApplySettings,
    showSectionTitle = true,
    mode = "full",
}: CharacterSettingsSectionProps & { mode?: CharacterSettingsSectionMode }) {
    const showCameraSelection = mode !== "display";
    const showDisplayOptions = mode !== "camera";
    const sectionLabel =
        mode === "camera"
            ? "視線用カメラ"
            : mode === "display"
              ? "キャラクター表示"
              : "キャラクターと視線";
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showSectionTitle ? (
                <HelpLabel text="キャラクター設定" />
            ) : (
                <div
                    style={{
                        opacity: 0.8,
                        fontWeight: 700,
                        marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                    }}
                >
                    {sectionLabel}
                </div>
            )}
            {showCameraSelection ? (
                <div style={{ marginBottom: showDisplayOptions ? `${sectionSpacingPx}px` : "0" }}>
                    <VideoInputDeviceField
                        settings={settings}
                        uiState={uiState}
                        uiHints={uiHints}
                        snapshot={mediaDeviceSnapshot}
                        selection={videoInputSelection}
                        onApplySettings={onApplySettings}
                    />
                </div>
            ) : null}
            {showDisplayOptions ? (
                <CharacterDisplayToggles
                    settings={settings}
                    uiState={uiState}
                    uiHints={uiHints}
                    onApplySettings={onApplySettings}
                    renderHint={(label, message) => (
                        <div
                            style={{
                                marginTop: `${settingsTuning.hintMarginTopPx}px`,
                                opacity: 0.7,
                                lineHeight: 1.3,
                            }}
                        >
                            {label}: {message}
                        </div>
                    )}
                />
            ) : null}
        </div>
    );
}

type LookingGlassSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    onApplySettings: ApplySettingsFn;
    showSectionTitle?: boolean;
};

export function LookingGlassSettingsSection({
    settings,
    onApplySettings,
    showSectionTitle = true,
}: LookingGlassSettingsSectionProps) {
    // 実機調整を速くするための簡易プリセット。最終的な値は個別調整で上書き可能。
    const presets: Array<{ label: string; values: Partial<SincroAppSettingsSnapshot> }> = [
        {
            label: "標準 (Default)",
            // 既定値は展示実機で焦点を合わせやすかった Focus 値を採用する。
            values: {
                lgTileHeight: 512,
                lgNumViews: 45,
                lgTargetY: 0.95,
                lgTargetZ: 0.05,
                lgTargetDiam: 1.25,
                lgDepthiness: 0.85,
                lgFovyDeg: 24,
            },
        },
        {
            label: "縦長 (Portrait)",
            values: {
                lgTileHeight: 640,
                lgNumViews: 45,
                lgTargetY: 1.35,
                lgTargetZ: 0.45,
                lgTargetDiam: 0.8,
                lgDepthiness: 0.9,
                lgFovyDeg: 22,
            },
        },
        {
            label: "広角 (Wide)",
            values: {
                lgTileHeight: 512,
                lgNumViews: 48,
                lgTargetY: 1.15,
                lgTargetZ: 0.6,
                lgTargetDiam: 0.95,
                lgDepthiness: 1.2,
                lgFovyDeg: 30,
            },
        },
        {
            label: "焦点調整用 (Focus)",
            // 実機検証で Target Z を 0.05 付近まで寄せると焦点が合いやすいケースがあったため反映。
            // 展示構図（全身を収めやすい引き気味・下寄り）も合わせて既定値に寄せる。
            values: {
                lgTileHeight: 512,
                lgNumViews: 45,
                lgTargetY: 0.95,
                lgTargetZ: 0.05,
                lgTargetDiam: 1.25,
                lgDepthiness: 0.85,
                lgFovyDeg: 24,
            },
        },
    ];
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showSectionTitle ? (
                <HelpLabel text="Looking Glass 設定" />
            ) : (
                <div
                    style={{
                        opacity: 0.8,
                        fontWeight: 700,
                        marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                    }}
                >
                    Looking Glass 表示
                </div>
            )}
            <div style={{ opacity: 0.6, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                これらの値は、次回の Looking Glass 起動時に適用されます。
            </div>
            <div style={{ opacity: 0.7, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                ピンボケ気味の場合は、まず <code>Target Z</code> と <code>Target Diam</code>{" "}
                を少しずつ調整してください。
            </div>
            {/* プリセットは初期位置合わせの近道。最終的な値は下の数値入力で追い込む。 */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: `${compactGapPx}px`,
                    marginBottom: `${rowGapPx}px`,
                }}
            >
                {presets.map((preset) => (
                    <SettingsButton
                        key={preset.label}
                        type="button"
                        onClick={() => onApplySettings(preset.values)}
                    >
                        {preset.label}
                    </SettingsButton>
                ))}
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: `${compactGapPx}px`,
                }}
            >
                <NumericSettingField
                    label="タイル高さ (Tile Height)"
                    help={settingHelp.lgTileHeight}
                    value={settings.lgTileHeight}
                    min={256}
                    max={2048}
                    step={1}
                    onChange={(value) => onApplySettings({ lgTileHeight: value })}
                />
                <NumericSettingField
                    label="視差ビュー数 (Views)"
                    help={settingHelp.lgNumViews}
                    value={settings.lgNumViews}
                    min={8}
                    max={64}
                    step={1}
                    onChange={(value) => onApplySettings({ lgNumViews: value })}
                />
                <NumericSettingField
                    label="注視高さ (Target Y)"
                    help={settingHelp.lgTargetY}
                    value={settings.lgTargetY}
                    min={-2}
                    max={4}
                    step={0.05}
                    onChange={(value) => onApplySettings({ lgTargetY: value })}
                />
                <NumericSettingField
                    label="注視奥行き (Target Z)"
                    help={settingHelp.lgTargetZ}
                    value={settings.lgTargetZ}
                    min={-1}
                    max={2}
                    step={0.05}
                    onChange={(value) => onApplySettings({ lgTargetZ: value })}
                />
                <NumericSettingField
                    label="注視範囲 (Target Diam)"
                    help={settingHelp.lgTargetDiam}
                    value={settings.lgTargetDiam}
                    min={0.1}
                    max={3}
                    step={0.05}
                    onChange={(value) => onApplySettings({ lgTargetDiam: value })}
                />
                <NumericSettingField
                    label="奥行き強調 (Depthiness)"
                    help={settingHelp.lgDepthiness}
                    value={settings.lgDepthiness}
                    min={0}
                    max={4}
                    step={0.05}
                    onChange={(value) => onApplySettings({ lgDepthiness: value })}
                />
                <NumericSettingField
                    label="縦FOV (FOV Y, deg)"
                    help={settingHelp.lgFovyDeg}
                    value={settings.lgFovyDeg}
                    min={5}
                    max={80}
                    step={0.5}
                    onChange={(value) => onApplySettings({ lgFovyDeg: value })}
                />
            </div>
        </div>
    );
}

type StartupSettingsSectionProps = SettingsApplyProps & {
    isRunning: boolean;
    startupStatus: SincroAppStartupSettingsStatus;
    startupCapabilities: SincroAppStartupSettingsCapabilities;
    showSectionTitle?: boolean;
};

export function StartupSettingsSection({
    settings,
    uiState,
    onApplySettings,
    isRunning,
    startupStatus,
    startupCapabilities,
    showSectionTitle = true,
}: StartupSettingsSectionProps) {
    // 表示対象がない場合は、空カードや「項目なし」文言を出さずに section ごと隠す。
    if (!startupCapabilities.enableVR) {
        return null;
    }
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            {showSectionTitle ? (
                <HelpLabel text="開始時の動作" />
            ) : (
                <div
                    style={{
                        opacity: 0.8,
                        fontWeight: 700,
                        marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                    }}
                >
                    ページ開始時の動作
                </div>
            )}
            <StartupBehaviorFields
                settings={settings}
                uiState={uiState}
                onApplySettings={onApplySettings}
                isRunning={isRunning}
                startupStatus={startupStatus}
                startupCapabilities={startupCapabilities}
                useFieldStack={false}
                introText={{
                    running:
                        "開始前に決まる動きです。いま変更した内容を反映したい時は、いったん停止してからもう一度始めてください。",
                    stopped:
                        "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。",
                }}
                renderHint={(message, tone) => (
                    <div
                        style={{
                            opacity: tone ? 1 : 0.6,
                            marginBottom: `${compactGapPx}px`,
                            color:
                                tone === "warning"
                                    ? "#ffd38a"
                                    : tone === "info"
                                      ? "#b8e0ff"
                                      : undefined,
                            lineHeight: 1.3,
                        }}
                    >
                        {message}
                    </div>
                )}
            />
        </div>
    );
}

type NumericSettingFieldProps = {
    label: string;
    help?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
};

function NumericSettingField({
    label,
    help,
    value,
    min,
    max,
    step,
    onChange,
}: NumericSettingFieldProps) {
    return (
        // 数値入力の最終丸めは AppController 側で行うため、UI では入力値をそのまま渡す。
        <div style={{ display: "grid", gap: "4px" }}>
            <span style={{ opacity: 0.8, display: "flex", alignItems: "center" }}>
                {label}
                {help ? <HelpBadge help={help} /> : null}
            </span>
            <SettingsInput
                type="number"
                value={Number.isFinite(value) ? value : 0}
                min={min}
                max={max}
                step={step}
                aria-label={label}
                onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) {
                        return;
                    }
                    // 最終的な丸め/範囲制御は AppController 側で行い、UIは入力値をそのまま渡す。
                    onChange(nextValue);
                }}
            />
        </div>
    );
}
