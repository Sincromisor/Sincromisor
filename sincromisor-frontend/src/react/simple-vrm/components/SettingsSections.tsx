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
        "応答の進み方を切り替えます。ふだんの会話なら chat、発話の往復を揃えたい時は sincro を選びます。",
    audioInputDeviceId:
        "使うマイクを選びます。未選択ならブラウザで既定になっているマイクを使います。",
    videoInputDeviceId:
        "顔の向きや視線の検出に使うカメラを選びます。未選択ならブラウザで既定になっているカメラを使います。",
    enableNoiseSuppression:
        "周囲のザーッというノイズを抑えます。部屋の空調音やPCファン音が入りやすい時に向いています。",
    enableEchoCancellation:
        "スピーカーから出た音がマイクに戻るのを抑えます。ヘッドホンを使わずに話す時に向いています。",
    enableAutoGainControl:
        "マイク音量を自動で整えます。声の大きさが変わりやすい時や、入力レベルが安定しない時に向いています。",
    enableVadGate:
        "話していない時の送信を抑えます。無音でも反応しやすい環境で、誤反応を減らしたい時に向いています。",
    enableVenueNoiseMode:
        "反射音や周囲のざわつきが多い場所向けの調整です。イベント会場や広い部屋で使う時に試してください。",
    enableCharacter:
        "3Dキャラクターを表示します。動作を軽くしたい時や、音声まわりだけ確認したい時はオフにします。",
    enableCharacterGaze:
        "カメラから顔の向きや視線を読み取ります。顔の向きに合わせた演出や自動ミュートを使いたい時にオンにします。",
    enableAutoMute:
        "顔の向きに合わせて自動でミュートを切り替えます。展示やハンズフリー運用で、話していない時を静かにしたい場面に向いています。",
    enableTalk:
        "ページを開いた時に会話機能を準備します。会話をすぐ始めたいページで使います。",
    enableInspector:
        "開発者向けの表示確認ツールを使えるようにします。表示の切り分けや検証が必要な時だけオンにします。",
    enableVR:
        "VR で開くための準備を行います。VR 対応ページを使う時だけオンにします。",
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
                    label="ノイズを抑える"
                    help={settingHelp.enableNoiseSuppression}
                    checked={!!settings.enableNoiseSuppression}
                    disabled={uiState.enableNoiseSuppressionDisabled}
                    onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
                />
                <SettingToggle
                    label="音の回り込みを抑える"
                    help={settingHelp.enableEchoCancellation}
                    checked={!!settings.enableEchoCancellation}
                    disabled={uiState.enableEchoCancellationDisabled}
                    onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
                />
                <SettingToggle
                    label="音量を自動で整える"
                    help={settingHelp.enableAutoGainControl}
                    checked={!!settings.enableAutoGainControl}
                    disabled={uiState.enableAutoGainControlDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
                />
                <SettingToggle
                    label="無音時の送信を抑える"
                    help={settingHelp.enableVadGate}
                    checked={!!settings.enableVadGate}
                    disabled={uiState.enableVadGateDisabled}
                    onChange={(checked) => onApplySettings({ enableVadGate: checked })}
                />
                <SettingToggle
                    label="にぎやかな場所向けに調整"
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
                    label="3Dキャラクターを表示"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
                <SettingToggle
                    label="顔の向きを使う"
                    help={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <SettingToggle
                    label="自動でミュートする"
                    help={settingHelp.enableAutoMute}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </div>
            {uiHints.enableCharacterReason ? (
                <div style={{ marginTop: `${compactGapPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    3Dキャラクター表示: {uiHints.enableCharacterReason}
                </div>
            ) : null}
            {uiHints.enableCharacterGazeReason ? (
                <div style={{ marginTop: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    顔の向き: {uiHints.enableCharacterGazeReason}
                </div>
            ) : null}
            {uiHints.enableAutoMuteReason ? (
                <div style={{ marginTop: `${settingsTuning.hintMarginTopPx}px`, opacity: 0.7, lineHeight: 1.3 }}>
                    自動ミュート: {uiHints.enableAutoMuteReason}
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
            label: "会話機能を準備する",
            help: settingHelp.enableTalk,
            checked: !!settings.enableTalk,
            disabled: uiState.enableTalkDisabled,
            supported: startupCapabilities.enableTalk,
            onChange: (checked: boolean) => onApplySettings({ enableTalk: checked }),
        },
        {
            key: "enableInspector" as const,
            label: "開発者向け表示確認を使う",
            help: settingHelp.enableInspector,
            checked: !!settings.enableInspector,
            disabled: uiState.enableInspectorDisabled,
            supported: startupCapabilities.enableInspector,
            onChange: (checked: boolean) => onApplySettings({ enableInspector: checked }),
        },
        {
            key: "enableVR" as const,
            label: "VRで開く準備をする",
            help: settingHelp.enableVR,
            checked: !!settings.enableVR,
            disabled: uiState.enableVRDisabled,
            supported: startupCapabilities.enableVR,
            onChange: (checked: boolean) => onApplySettings({ enableVR: checked }),
        },
    ];
    const supportedItems = startupItems.filter((item) => item.supported);
    // page variant 側で「全部未対応ならセクションごと消す」用途に使う。
    if (hideIfNoSupported && supportedItems.length === 0) {
        return null;
    }
    return (
        <div style={{ marginBottom: `${sectionSpacingPx}px` }}>
            <HelpLabel text="開始時の動作" />
            <div style={{ opacity: 0.6, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                {isRunning
                    ? "開始前に決まる動きです。いま変更した内容を反映したい時は、いったん停止してからもう一度始めてください。"
                    : "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。"}
            </div>
            {startupStatus.requiresRestart ? (
                <div style={{ marginBottom: `${compactGapPx}px`, color: "#ffd38a", lineHeight: 1.3 }}>
                    変更した内容を反映するには、いったん停止してからもう一度始めてください。{changedLabel}
                </div>
            ) : null}
            {!startupStatus.requiresRestart && startupStatus.willApplyOnNextStart ? (
                <div style={{ marginBottom: `${compactGapPx}px`, color: "#b8e0ff", lineHeight: 1.3 }}>
                    変更した内容は次に始める時に反映されます。{changedLabel}
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
                <div style={{ opacity: 0.7, marginBottom: `${compactGapPx}px`, lineHeight: 1.3 }}>
                    このページでは、開始前に切り替える項目はありません。
                </div>
            )}
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
