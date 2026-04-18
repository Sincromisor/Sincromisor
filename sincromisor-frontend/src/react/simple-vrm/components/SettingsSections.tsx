import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiState,
    SincroAppSettingsUiHints,
    SincroAppStartupSettingsStatus,
    SincroAppStartupSettingsCapabilities,
} from "../panelTypes";
import { UI_TUNING } from "../../app/uiTuning";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../../ts/MediaDevices/SincroMediaDeviceService";

// Control Panel 用の設定セクション群。
// 起動前 dialog 用フォームとは分離し、ページ常設パネル向けの文言/密度/導線をここで管理する。
const fieldStyle: CSSProperties = {
    width: "100%",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#f4f7fb",
    padding: "8px 10px",
    boxSizing: "border-box",
};

const sectionSpacingPx = UI_TUNING.controlPanel.sectionSpacingPx;
const detailsContentTopMarginPx = UI_TUNING.controlPanel.detailsContentTopMarginPx;
const settingsTuning = UI_TUNING.controlPanel.settings;
const compactGapPx = settingsTuning.compactGapPx;
const rowGapPx = settingsTuning.rowGapPx;

const settingHelp = {
    titleText: "会話UIなどに表示されるタイトル文字列です。配信名・キャラクター名を表示したいときに設定します。",
    talkMode:
        "応答モードを切り替えます。通常の会話用途では chat、同期的なやり取りや Sincromisor 想定フローでは sincro を使う想定です。",
    audioInputDeviceId:
        "起動前設定と同じ正式な設定経路で使うマイクを選びます。未選択ならブラウザ既定の入力デバイスを利用します。",
    videoInputDeviceId:
        "起動前設定と同じ正式な設定経路で、Gaze（視線検出）用カメラを選びます。未選択ならブラウザ既定のカメラを利用します。",
    enableNoiseSuppression:
        "Noise Suppression。周囲の定常ノイズを抑えます。家庭・オフィス環境で雑音が気になる場合に有効化を推奨します。",
    enableEchoCancellation:
        "Echo Cancellation。スピーカー音の回り込みを抑えます。ヘッドホン未使用時やスピーカー再生時に有効化を推奨します。",
    enableAutoGainControl:
        "Auto Gain Control。入力音量を自動補正します。マイク音量が不安定な環境で有効化を推奨します。",
    enableVadGate:
        "VAD Gate。無音区間の送信を抑えて誤反応を減らします。雑音で反応しやすい場合に有効化を推奨します。",
    enableVenueNoiseMode:
        "会場ノイズ向けモード。イベント会場や広い空間など、反射音・環境音が多い場面での利用を想定しています。",
    enableCharacter:
        "3Dキャラクター表示の有効/無効です。描画負荷を下げたい場合や音声動作だけ確認したい場合は無効化します。",
    enableCharacterGaze:
        "Gaze（視線・顔向き推定）を有効化します。カメラに向いた時の演出や AutoMute と連携したい場合に有効化を推奨します。",
    enableAutoMute:
        "顔の向きなどに応じて自動的に mute を切り替えます。ハンズフリー運用や展示用途で便利です（Gaze 有効時を推奨）。",
    enableTalk:
        "ページ初期化時に Talk 機能を使う設定です。ページによっては未使用です。初期化前に設定すると反映されやすくなります。",
    enableInspector:
        "Three.js Inspector などの開発者向け機能を有効化します。表示確認・デバッグ時のみ有効化を推奨します。",
    enableVR:
        "VR 起動に関する初期化設定です。VR 対応ページでのみ有効です。VR 利用時に有効化を推奨します。",
    lgTileHeight:
        "Looking Glass のタイル解像度の高さです。高いほど精細になりますが負荷が増えます。まずは既定値から調整してください。",
    lgNumViews:
        "Looking Glass の視差ビュー数です。多いほど滑らかな立体感になりますが描画負荷が増えます。",
    lgTargetY:
        "Looking Glass 表示時の注視高さ（Y）です。キャラクターの顔位置に合わせて微調整すると見やすくなります。",
    lgTargetZ:
        "Looking Glass 表示時の注視奥行き（Z）です。ピンボケや前後の見え方が不自然な場合に、少しずつ調整してください。",
    lgTargetDiam:
        "Looking Glass の注視範囲（target diameter）です。焦点が合いにくい時は小さめ/大きめに振って見え方を確認してください。",
    lgDepthiness:
        "Looking Glass の奥行き強調量です。立体感を強くしたい時に上げ、破綻が出る場合は下げます。",
    lgFovyDeg:
        "Looking Glass 用の縦方向視野角（FOV Y）です。被写体の見え方が窮屈/広すぎる場合に調整します。",
} as const;

const tooltipBubbleStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: `calc(100% + ${settingsTuning.tooltipOffsetPx}px)`,
    zIndex: 20,
    width: "min(300px, calc(100vw - 72px))",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(15, 18, 24, 0.96)",
    color: "#eef3fb",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    padding: "8px 10px",
    lineHeight: 1.45,
    fontSize: `${settingsTuning.tooltipFontSizePx}px`,
    whiteSpace: "normal",
    wordBreak: "break-word",
    pointerEvents: "none",
};

function HelpTooltip({ help, children }: { help?: string; children: ReactNode }) {
    const containerRef = useRef<HTMLSpanElement | null>(null);
    const [visible, setVisible] = useState<boolean>(false);
    if (!help) {
        return <>{children}</>;
    }
    useEffect(() => {
        if (!visible) {
            return;
        }
        // hover だけでなくタップ操作でも閉じられるよう、外側 pointerdown で明示的に閉じる。
        const handlePointerDown = (event: PointerEvent) => {
            const root = containerRef.current;
            if (!root) {
                return;
            }
            if (event.target instanceof Node && !root.contains(event.target)) {
                setVisible(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [visible]);
    return (
        <span
            ref={containerRef}
            style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
            onClickCapture={(event) => {
                // モバイルでは hover が無いため、? バッジのタップで説明を開閉できるようにする。
                event.preventDefault();
                event.stopPropagation();
                setVisible((prev) => !prev);
            }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onFocus={() => setVisible(true)}
            onBlur={() => setVisible(false)}
        >
            {children}
            {visible ? (
                <span role="tooltip" style={tooltipBubbleStyle}>
                    {help}
                </span>
            ) : null}
        </span>
    );
}

function HelpBadge({ help }: { help: string }) {
    return (
        <HelpTooltip help={help}>
            <span
                tabIndex={0}
                role="button"
                aria-label="設定説明を表示"
                aria-haspopup="true"
                onPointerDown={(event) => {
                    // label 内の help バッジをタップした時に checkbox/select の操作へ伝播させない。
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                    }
                }}
                style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: `${settingsTuning.helpBadgeSizePx}px`,
                    height: `${settingsTuning.helpBadgeSizePx}px`,
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#dce7f8",
                    fontSize: `${settingsTuning.tooltipFontSizePx}px`,
                    lineHeight: 1,
                    cursor: "help",
                    userSelect: "none",
                    marginLeft: `${settingsTuning.helpBadgeMarginLeftPx}px`,
                    touchAction: "manipulation",
                }}
            >
                ?
            </span>
        </HelpTooltip>
    );
}

function HelpLabel({ text, help }: { text: string; help?: string }) {
    return (
        <div style={{ opacity: 0.75, marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`, display: "flex", alignItems: "center" }}>
            <span>{text}</span>
            {help ? <HelpBadge help={help} /> : null}
        </div>
    );
}

type BasicSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onTitleChange: (titleText: string) => void;
    onTalkModeChange: (talkMode: string) => void;
    showTitle?: boolean;
    showTalkMode?: boolean;
};

export function BasicSettingsSection({
    settings,
    uiState,
    onTitleChange,
    onTalkModeChange,
    showTitle = true,
    showTalkMode = true,
}: BasicSettingsSectionProps) {
    if (!showTitle && !showTalkMode) {
        // variant 側で表示対象を完全に外した場合は空描画にする。
        return null;
    }
    return (
        <>
            {showTitle ? (
                <div style={{ marginTop: `${detailsContentTopMarginPx}px`, marginBottom: `${sectionSpacingPx}px` }}>
                    <HelpLabel text="タイトル" help={settingHelp.titleText} />
                    <input
                        type="text"
                        value={settings.titleText ?? ""}
                        onChange={(e) => onTitleChange(e.target.value)}
                        disabled={uiState.titleTextDisabled}
                        style={fieldStyle}
                    />
                </div>
            ) : null}
            {showTalkMode ? (
                <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
                    <HelpLabel text="トークモード (talk mode)" help={settingHelp.talkMode} />
                    <div style={{ display: "flex", gap: `${rowGapPx}px` }}>
                        <select
                            value={settings.talkMode}
                            onChange={(e) => onTalkModeChange(e.target.value)}
                            disabled={uiState.talkModeDisabled}
                            style={{ ...fieldStyle, flex: 1 }}
                        >
                            <option value="chat">chat</option>
                            <option value="sincro">sincro</option>
                        </select>
                    </div>
                </div>
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
};

export function MicSettingsSection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    audioInputSelection,
    onApplySettings,
    onRefreshDevices,
}: DeviceSettingsProps) {
    const [refreshMessage, setRefreshMessage] = useState<string>("");

    const handleRefreshDevices = () => {
        setRefreshMessage("");
        void onRefreshDevices().then((nextSnapshot) => {
            if (nextSnapshot.refreshError) {
                setRefreshMessage(`デバイス一覧の再取得に失敗しました: ${nextSnapshot.refreshError}`);
                return;
            }
            setRefreshMessage("デバイス一覧を更新しました。");
        });
    };

    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: `${compactGapPx}px`,
                    marginBottom: `${settingsTuning.helpLabelMarginBottomPx}px`,
                }}
            >
                <HelpLabel text="マイク設定" />
                <button
                    type="button"
                    onClick={handleRefreshDevices}
                    disabled={mediaDeviceSnapshot.isRefreshing}
                    style={{
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#f4f7fb",
                        padding: "6px 8px",
                        cursor: mediaDeviceSnapshot.isRefreshing ? "progress" : "pointer",
                    }}
                >
                    {mediaDeviceSnapshot.isRefreshing ? "更新中..." : "再読み込み"}
                </button>
            </div>
            <div style={{ marginBottom: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                日常の設定変更はここが正式な導線です。Debug Console は音量や接続状態の診断に使います。
            </div>
            <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
                <HelpLabel text="マイク入力" help={settingHelp.audioInputDeviceId} />
                <select
                    value={settings.audioInputDeviceId ?? ""}
                    onChange={(event) => onApplySettings({ audioInputDeviceId: normalizeSelectedDeviceId(event.target.value) })}
                    disabled={uiState.audioInputDeviceDisabled}
                    style={fieldStyle}
                >
                    <option value="">ブラウザ既定のマイクを使う</option>
                    {mediaDeviceSnapshot.audioInputs.map((option) => (
                        <option key={option.deviceId} value={option.deviceId}>{option.label}</option>
                    ))}
                </select>
                <DeviceSelectionHint
                    emptyMessage="利用可能なマイクが見つかりません。接続後に再読み込みしてください。"
                    snapshot={mediaDeviceSnapshot}
                    selection={audioInputSelection}
                    optionsCount={mediaDeviceSnapshot.audioInputs.length}
                    unavailableReason={uiHints.audioInputDeviceReason}
                    kindLabel="マイク"
                />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${compactGapPx}px` }}>
                <SettingToggle
                    label="NS"
                    help={settingHelp.enableNoiseSuppression}
                    checked={!!settings.enableNoiseSuppression}
                    disabled={uiState.enableNoiseSuppressionDisabled}
                    onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
                />
                <SettingToggle
                    label="EC"
                    help={settingHelp.enableEchoCancellation}
                    checked={!!settings.enableEchoCancellation}
                    disabled={uiState.enableEchoCancellationDisabled}
                    onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
                />
                <SettingToggle
                    label="AGC"
                    help={settingHelp.enableAutoGainControl}
                    checked={!!settings.enableAutoGainControl}
                    disabled={uiState.enableAutoGainControlDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
                />
                <SettingToggle
                    label="VAD Gate"
                    help={settingHelp.enableVadGate}
                    checked={!!settings.enableVadGate}
                    disabled={uiState.enableVadGateDisabled}
                    onChange={(checked) => onApplySettings({ enableVadGate: checked })}
                />
                <SettingToggle
                    label="Venue"
                    help={settingHelp.enableVenueNoiseMode}
                    checked={!!settings.enableVenueNoiseMode}
                    disabled={uiState.enableVenueNoiseModeDisabled}
                    onChange={(checked) => onApplySettings({ enableVenueNoiseMode: checked })}
                />
            </div>
            {refreshMessage ? (
                <div style={{ marginTop: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    {refreshMessage}
                </div>
            ) : null}
        </div>
    );
}

type CharacterSettingsSectionProps = DeviceSettingsProps & {
    videoInputSelection: SincroMediaDeviceSelectionState;
};

export function CharacterSettingsSection({
    settings,
    uiState,
    uiHints,
    mediaDeviceSnapshot,
    videoInputSelection,
    onApplySettings,
}: CharacterSettingsSectionProps) {
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            <HelpLabel text="キャラクター設定" />
            <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
                <HelpLabel text="視線用カメラ" help={settingHelp.videoInputDeviceId} />
                <select
                    value={settings.videoInputDeviceId ?? ""}
                    onChange={(event) => onApplySettings({ videoInputDeviceId: normalizeSelectedDeviceId(event.target.value) })}
                    disabled={uiState.videoInputDeviceDisabled}
                    style={fieldStyle}
                >
                    <option value="">ブラウザ既定のカメラを使う</option>
                    {mediaDeviceSnapshot.videoInputs.map((option) => (
                        <option key={option.deviceId} value={option.deviceId}>{option.label}</option>
                    ))}
                </select>
                <DeviceSelectionHint
                    emptyMessage="利用可能なカメラが見つかりません。接続後に再読み込みしてください。"
                    snapshot={mediaDeviceSnapshot}
                    selection={videoInputSelection}
                    optionsCount={mediaDeviceSnapshot.videoInputs.length}
                    unavailableReason={uiHints.videoInputDeviceReason}
                    kindLabel="カメラ"
                />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${compactGapPx}px` }}>
                <SettingToggle
                    label="Character"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
                <SettingToggle
                    label="Gaze"
                    help={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <SettingToggle
                    label="AutoMute"
                    help={settingHelp.enableAutoMute}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </div>
            {uiHints.enableCharacterReason ? (
                <div style={{ marginTop: `${compactGapPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    Character: {uiHints.enableCharacterReason}
                </div>
            ) : null}
            {uiHints.enableCharacterGazeReason ? (
                <div style={{ marginTop: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    Gaze: {uiHints.enableCharacterGazeReason}
                </div>
            ) : null}
            {uiHints.enableAutoMuteReason ? (
                <div style={{ marginTop: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    AutoMute: {uiHints.enableAutoMuteReason}
                </div>
            ) : null}
        </div>
    );
}

type DeviceSelectionHintProps = {
    emptyMessage: string;
    snapshot: SincroMediaDeviceSnapshot;
    selection: SincroMediaDeviceSelectionState;
    optionsCount: number;
    unavailableReason?: string;
    kindLabel: string;
};

function DeviceSelectionHint({
    emptyMessage,
    snapshot,
    selection,
    optionsCount,
    unavailableReason,
    kindLabel,
}: DeviceSelectionHintProps) {
    const messages: string[] = [];
    if (!snapshot.isSupported) {
        messages.push("このブラウザではメディアデバイス列挙に対応していません。");
    }
    if (snapshot.refreshError) {
        messages.push(`デバイス一覧の取得に失敗しました: ${snapshot.refreshError}`);
    }
    if (optionsCount === 0 && !snapshot.isRefreshing && !snapshot.refreshError) {
        messages.push(emptyMessage);
    }
    if (!snapshot.labelsResolved && optionsCount > 0) {
        messages.push("ブラウザ権限が未許可だと実デバイス名を表示できないことがあります。");
    }
    if (selection.isSelected && selection.availabilityKnown && !selection.isAvailable) {
        messages.push(`選択中の${kindLabel}は現在見つかりません。別のデバイスへ切り替えるか、既定デバイスを選んでください。`);
    }
    if (selection.isAvailable && selection.matchedDevice) {
        messages.push(`選択中: ${selection.matchedDevice.label}`);
    }
    if (unavailableReason) {
        messages.push(unavailableReason);
    }
    if (messages.length === 0) {
        return null;
    }
    return (
        <div style={{ marginTop: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
            {messages.map((message) => (
                <div key={message}>{message}</div>
            ))}
        </div>
    );
}

function normalizeSelectedDeviceId(value: string): string | null {
    return value.trim().length > 0 ? value : null;
}

type LookingGlassSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    onApplySettings: ApplySettingsFn;
};

export function LookingGlassSettingsSection({ settings, onApplySettings }: LookingGlassSettingsSectionProps) {
    // 実機調整を速くするための簡易プリセット。最終的な値は個別調整で上書き可能。
    const presets: Array<{ label: string; values: Partial<SincroAppSettingsSnapshot> }> = [
        {
            label: "標準 (Default)",
            // 既定値は展示実機で焦点を合わせやすかった Focus 値を採用する。
            values: { lgTileHeight: 512, lgNumViews: 45, lgTargetY: 0.95, lgTargetZ: 0.05, lgTargetDiam: 1.25, lgDepthiness: 0.85, lgFovyDeg: 24 },
        },
        {
            label: "縦長 (Portrait)",
            values: { lgTileHeight: 640, lgNumViews: 45, lgTargetY: 1.35, lgTargetZ: 0.45, lgTargetDiam: 0.8, lgDepthiness: 0.9, lgFovyDeg: 22 },
        },
        {
            label: "広角 (Wide)",
            values: { lgTileHeight: 512, lgNumViews: 48, lgTargetY: 1.15, lgTargetZ: 0.6, lgTargetDiam: 0.95, lgDepthiness: 1.2, lgFovyDeg: 30 },
        },
        {
            label: "焦点調整用 (Focus)",
            // 実機検証で Target Z を 0.05 付近まで寄せると焦点が合いやすいケースがあったため反映。
            // 展示構図（全身を収めやすい引き気味・下寄り）も合わせて既定値に寄せる。
            values: { lgTileHeight: 512, lgNumViews: 45, lgTargetY: 0.95, lgTargetZ: 0.05, lgTargetDiam: 1.25, lgDepthiness: 0.85, lgFovyDeg: 24 },
        },
    ];
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            <HelpLabel text="Looking Glass 設定" />
            <div style={{ opacity: 0.6, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                これらの値は、次回の Looking Glass WebXR セッション開始時に適用されます。
            </div>
            <div style={{ opacity: 0.7, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                ピンボケ気味の場合は、まず <code>Target Z</code> と <code>Target Diam</code> を少しずつ調整してください。
            </div>
            {/* プリセットは初期位置合わせの近道。最終的な値は下の数値入力で追い込む。 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: `${compactGapPx}px`, marginBottom: `${rowGapPx}px` }}>
                {presets.map((preset) => (
                    <button
                        key={preset.label}
                        type="button"
                        onClick={() => onApplySettings(preset.values)}
                        style={{
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.06)",
                            color: "#f4f7fb",
                            padding: "6px 8px",
                            cursor: "pointer",
                        }}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${compactGapPx}px` }}>
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
    hideIfNoSupported?: boolean;
};

export function StartupSettingsSection({
    settings,
    uiState,
    onApplySettings,
    isRunning,
    startupStatus,
    startupCapabilities,
    hideIfNoSupported = false,
}: StartupSettingsSectionProps) {
    const changedLabel = startupStatus.changedKeys.length > 0 ? ` 変更: ${startupStatus.changedKeys.join(", ")}` : "";
    const startupItems = [
        {
            key: "enableTalk" as const,
            label: "Talk",
            help: settingHelp.enableTalk,
            checked: !!settings.enableTalk,
            disabled: uiState.enableTalkDisabled,
            supported: startupCapabilities.enableTalk,
            onChange: (checked: boolean) => onApplySettings({ enableTalk: checked }),
        },
        {
            key: "enableInspector" as const,
            label: "Inspector",
            help: settingHelp.enableInspector,
            checked: !!settings.enableInspector,
            disabled: uiState.enableInspectorDisabled,
            supported: startupCapabilities.enableInspector,
            onChange: (checked: boolean) => onApplySettings({ enableInspector: checked }),
        },
        {
            key: "enableVR" as const,
            label: "VR",
            help: settingHelp.enableVR,
            checked: !!settings.enableVR,
            disabled: uiState.enableVRDisabled,
            supported: startupCapabilities.enableVR,
            onChange: (checked: boolean) => onApplySettings({ enableVR: checked }),
        },
    ];
    const supportedItems = startupItems.filter((item) => item.supported);
    const unsupportedItems = startupItems.filter((item) => !item.supported);
    const unsupportedKeys = unsupportedItems.map((item) => item.key);
    // page variant 側で「全部未対応ならセクションごと消す」用途に使う。
    if (hideIfNoSupported && supportedItems.length === 0) {
        return null;
    }
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            <HelpLabel text="ページ起動時設定" />
            <div style={{ opacity: 0.6, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                {isRunning
                    ? "主に初期化時に効く設定です。起動中に変更した場合は再起動が必要になることがあります。"
                    : "主にページ初期化時の挙動に影響する設定です。"}
            </div>
            {startupStatus.requiresRestart ? (
                <div style={{ marginBottom: `${compactGapPx}px`, color: "#ffd38a", lineHeight: 1.3 }}>
                    起動時設定を完全に反映するには再起動を推奨します。{changedLabel}
                </div>
            ) : null}
            {!startupStatus.requiresRestart && startupStatus.willApplyOnNextStart ? (
                <div style={{ marginBottom: `${compactGapPx}px`, color: "#b8e0ff", lineHeight: 1.3 }}>
                    起動時設定の変更は次回起動時に反映されます。{changedLabel}
                </div>
            ) : null}
            {unsupportedKeys.length > 0 ? (
                <div style={{ marginBottom: `${compactGapPx}px`, color: "#b8e0ff", opacity: 0.85, lineHeight: 1.3 }}>
                    このページでは未使用: {unsupportedKeys.join(", ")}
                </div>
            ) : null}
            {supportedItems.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${compactGapPx}px` }}>
                    {supportedItems.map((item) => (
                        <SettingToggle
                            key={item.key}
                            label={item.label}
                            help={item.help}
                            checked={item.checked}
                            disabled={item.disabled}
                            onChange={item.onChange}
                        />
                    ))}
                </div>
            ) : (
                <div style={{ opacity: 0.55, marginBottom: `${compactGapPx}px` }}>このページで有効な起動時設定はありません。</div>
            )}
            {unsupportedItems.length > 0 ? (
                <details style={{ marginTop: `${compactGapPx}px` }}>
                    {/* 未対応項目は通常表示から外し、必要時だけ参照できるようにする。 */}
                    <summary style={{ cursor: "pointer", opacity: 0.75 }}>
                        未対応の起動時トグルを表示 ({unsupportedItems.length})
                    </summary>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${compactGapPx}px`, marginTop: `${compactGapPx}px` }}>
                        {unsupportedItems.map((item) => (
                            <SettingToggle
                                key={item.key}
                                label={item.label}
                                help={item.help}
                                checked={item.checked}
                                disabled={true}
                                onChange={item.onChange}
                            />
                        ))}
                    </div>
                </details>
            ) : null}
        </div>
    );
}

type SettingToggleProps = {
    label: string;
    help?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
};

type NumericSettingFieldProps = {
    label: string;
    help?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
};

function NumericSettingField({ label, help, value, min, max, step, onChange }: NumericSettingFieldProps) {
    return (
        // 数値入力の最終丸めは AppController 側で行うため、UI では入力値をそのまま渡す。
        <label style={{ display: "grid", gap: "4px" }}>
            <span style={{ opacity: 0.8, display: "flex", alignItems: "center" }}>
                {label}
                {help ? <HelpBadge help={help} /> : null}
            </span>
            <input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) {
                        return;
                    }
                    // 最終的な丸め/範囲制御は AppController 側で行い、UIは入力値をそのまま渡す。
                    onChange(nextValue);
                }}
                style={fieldStyle}
            />
        </label>
    );
}

function SettingToggle({ label, help, checked, disabled = false, onChange }: SettingToggleProps) {
    return (
        // Control Panel 側は常設 UI のため、dialog 版より少し情報密度を高くした toggle 表示を使う。
        <label style={{
            display: "flex",
            alignItems: "center",
            gap: `${compactGapPx}px`,
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            opacity: disabled ? 0.6 : 1,
            cursor: "default",
        }}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <span style={{ display: "inline-flex", alignItems: "center" }}>
                {label}
                {help ? <HelpBadge help={help} /> : null}
            </span>
        </label>
    );
}
