import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../../app/appSettingsTypes";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../../ts/MediaDevices/SincroMediaDeviceService";

// 起動前 dialog 専用の settings form セクション群。
// Control Panel 共有部品とは切り分け、dialog 文脈の文言/レイアウト/tooltip をここで管理する。
type CommonProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onApplySettings: ApplySettingsFn;
};

type DialogBasicSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onTitleChange: (titleText: string) => void;
    onTalkModeChange: (talkMode: string) => void;
};

const fieldStyle: CSSProperties = {
    width: "100%",
    minHeight: "36px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#f4f7fb",
    padding: "7px 10px",
    lineHeight: 1.2,
    boxSizing: "border-box",
};

const cardSectionTitleStyle: CSSProperties = {
    opacity: 0.8,
    marginBottom: "4px",
    fontWeight: 700,
};

const settingHelp = {
    titleText: "会話UIなどに表示されるタイトル文字列です。配信名・キャラクター名を表示したい時に設定します。",
    talkMode: "応答の進み方を切り替えます。ふだんの会話なら chat、発話の往復を揃えたい時は sincro を選びます。",
    audioInputDeviceId: "使うマイクを選びます。未選択ならブラウザで既定になっているマイクを使います。",
    videoInputDeviceId: "顔の向きや視線の検出に使うカメラを選びます。未選択ならブラウザで既定になっているカメラを使います。",
    enableNoiseSuppression: "周囲のザーッというノイズを抑えます。部屋の空調音やPCファン音が入りやすい時に向いています。",
    enableEchoCancellation: "スピーカーから出た音がマイクに戻るのを抑えます。ヘッドホンを使わずに話す時に向いています。",
    enableAutoGainControl: "マイク音量を自動で整えます。声の大きさが変わりやすい時や、入力レベルが安定しない時に向いています。",
    enableVadGate: "話していない時の送信を抑えます。無音でも反応しやすい環境で、誤反応を減らしたい時に向いています。",
    enableVenueNoiseMode: "反射音や周囲のざわつきが多い場所向けの調整です。イベント会場や広い部屋で使う時に試してください。",
    enableCharacter: "3Dキャラクターを表示します。動作を軽くしたい時や、音声まわりだけ確認したい時はオフにします。",
    enableCharacterGaze: "カメラから顔の向きや視線を読み取ります。顔の向きに合わせた演出や自動ミュートを使いたい時にオンにします。",
    enableAutoMute: "顔の向きに合わせて自動でミュートを切り替えます。展示やハンズフリー運用で、話していない時を静かにしたい場面に向いています。",
} as const;

const tooltipBubbleBaseStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    zIndex: 20,
    width: "min(300px, calc(100vw - 96px))",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(15, 18, 24, 0.96)",
    color: "#eef3fb",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    padding: "8px 10px",
    lineHeight: 1.45,
    fontSize: "12px",
    whiteSpace: "normal",
    wordBreak: "break-word",
    pointerEvents: "none",
};

function HelpTooltip({ help, children }: { help?: string; children: ReactNode }) {
    const containerRef = useRef<HTMLSpanElement | null>(null);
    const [visible, setVisible] = useState<boolean>(false);
    const [align, setAlign] = useState<"left" | "right">("right");
    if (!help) {
        return <>{children}</>;
    }
    useEffect(() => {
        if (!visible) {
            return;
        }
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
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [visible]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        const root = containerRef.current;
        if (!root) {
            return;
        }
        // 画面左側の項目は left 基準、右側は right 基準にして dialog の横スクロール発生と見切れを防ぐ。
        const rect = root.getBoundingClientRect();
        const viewportMidX = window.innerWidth / 2;
        setAlign(rect.left < viewportMidX ? "left" : "right");
    }, [visible]);

    const tooltipBubbleStyle: CSSProperties = {
        ...tooltipBubbleBaseStyle,
        ...(align === "left" ? { left: 0 } : { right: 0 }),
    };

    return (
        <span
            ref={containerRef}
            style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
            onClickCapture={(event) => {
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
            {visible ? <span role="tooltip" style={tooltipBubbleStyle}>{help}</span> : null}
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
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                style={{
                    display: "inline-grid",
                    placeItems: "center",
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#dce7f8",
                    fontSize: "12px",
                    lineHeight: 1,
                    cursor: "help",
                    userSelect: "none",
                    marginLeft: "4px",
                    touchAction: "manipulation",
                }}
            >
                ?
            </span>
        </HelpTooltip>
    );
}

function LabelWithHelp({ text, help }: { text: string; help?: string }) {
    return (
        <div style={{ opacity: 0.75, marginBottom: "4px", display: "flex", alignItems: "center" }}>
            <span>{text}</span>
            {help ? <HelpBadge help={help} /> : null}
        </div>
    );
}

type DialogSettingsCategoryProps = {
    title: string;
    description: string;
    children: ReactNode;
};

export function DialogSettingsCategory({
    title,
    description,
    children,
}: DialogSettingsCategoryProps) {
    return (
        <section className="configurationDialogReactSettingsPanel__category">
            <div className="configurationDialogReactSettingsPanel__categoryTitle">{title}</div>
            <div className="configurationDialogReactSettingsPanel__categoryDescription">{description}</div>
            <div>{children}</div>
        </section>
    );
}

export function DialogBasicSettingsSection({
    settings,
    uiState,
    onTitleChange,
    onTalkModeChange,
    showSectionTitle = true,
}: DialogBasicSettingsSectionProps & { showSectionTitle?: boolean }) {
    return (
        <div style={{ marginTop: "4px", marginBottom: "8px" }}>
            {showSectionTitle ? <div style={cardSectionTitleStyle}>基本設定</div> : null}
            <div style={{ marginBottom: "8px" }}>
                <LabelWithHelp text="タイトル" help={settingHelp.titleText} />
                <input
                    type="text"
                    value={settings.titleText ?? ""}
                    onChange={(e) => onTitleChange(e.target.value)}
                    disabled={uiState.titleTextDisabled}
                    style={fieldStyle}
                />
            </div>
            <div>
                <LabelWithHelp text="トークモード (talk mode)" help={settingHelp.talkMode} />
                <select
                    value={settings.talkMode}
                    onChange={(e) => onTalkModeChange(e.target.value)}
                    disabled={uiState.talkModeDisabled}
                    style={fieldStyle}
                >
                    <option value="chat">chat</option>
                    <option value="sincro">sincro</option>
                </select>
            </div>
        </div>
    );
}

type DialogCharacterSettingsSectionProps = CommonProps & {
    uiHints: SincroAppSettingsUiHints;
};

type DialogDeviceSettingsSectionProps = CommonProps & {
    uiHints: SincroAppSettingsUiHints;
    snapshot: SincroMediaDeviceSnapshot;
    audioInputSelection: SincroMediaDeviceSelectionState;
    videoInputSelection: SincroMediaDeviceSelectionState;
    onRefreshDevices: () => Promise<SincroMediaDeviceSnapshot>;
    showSectionTitle?: boolean;
};

export function DialogDeviceSettingsSection({
    settings,
    uiState,
    uiHints,
    snapshot,
    audioInputSelection,
    videoInputSelection,
    onApplySettings,
    onRefreshDevices,
    showSectionTitle = true,
}: DialogDeviceSettingsSectionProps) {
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
        <div style={{ marginBottom: "8px" }}>
            <div style={{ ...cardSectionTitleStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: showSectionTitle ? "4px" : "0" }}>
                <span>{showSectionTitle ? "入力デバイス" : "マイクとカメラ"}</span>
                <button
                    type="button"
                    className="configurationDialogReactSettingsPanel__secondaryButton"
                    onClick={handleRefreshDevices}
                    disabled={snapshot.isRefreshing}
                >
                    {snapshot.isRefreshing ? "更新中..." : "再読み込み"}
                </button>
            </div>
            <div className="configurationDialogReactSettingsPanel__hintText">
                ここで選んだマイクとカメラは、開始後の設定パネルにも引き継がれます。始める前の確認や切り替えに使ってください。
            </div>
            <div style={{ marginBottom: "8px" }}>
                <LabelWithHelp text="マイク入力" help={settingHelp.audioInputDeviceId} />
                <select
                    value={settings.audioInputDeviceId ?? ""}
                    onChange={(event) => onApplySettings({ audioInputDeviceId: normalizeSelectedDeviceId(event.target.value) })}
                    disabled={uiState.audioInputDeviceDisabled}
                    style={fieldStyle}
                >
                    <option value="">ブラウザ既定のマイクを使う</option>
                    {snapshot.audioInputs.map((option) => (
                        <option key={option.deviceId} value={option.deviceId}>{option.label}</option>
                    ))}
                </select>
                <DeviceSelectionHint
                    emptyMessage="利用可能なマイクが見つかりません。接続後に再読み込みしてください。"
                    snapshot={snapshot}
                    selection={audioInputSelection}
                    optionsCount={snapshot.audioInputs.length}
                    unavailableReason={uiHints.audioInputDeviceReason}
                    kindLabel="マイク"
                />
            </div>
            <div>
                <LabelWithHelp text="視線用カメラ" help={settingHelp.videoInputDeviceId} />
                <select
                    value={settings.videoInputDeviceId ?? ""}
                    onChange={(event) => onApplySettings({ videoInputDeviceId: normalizeSelectedDeviceId(event.target.value) })}
                    disabled={uiState.videoInputDeviceDisabled}
                    style={fieldStyle}
                >
                    <option value="">ブラウザ既定のカメラを使う</option>
                    {snapshot.videoInputs.map((option) => (
                        <option key={option.deviceId} value={option.deviceId}>{option.label}</option>
                    ))}
                </select>
                <DeviceSelectionHint
                    emptyMessage="利用可能なカメラが見つかりません。接続後に再読み込みしてください。"
                    snapshot={snapshot}
                    selection={videoInputSelection}
                    optionsCount={snapshot.videoInputs.length}
                    unavailableReason={uiHints.videoInputDeviceReason}
                    kindLabel="カメラ"
                />
            </div>
            {refreshMessage ? (
                <div className="configurationDialogReactSettingsPanel__hintText">{refreshMessage}</div>
            ) : null}
        </div>
    );
}

export function DialogMicSettingsSection({
    settings,
    uiState,
    onApplySettings,
    showSectionTitle = true,
}: CommonProps & { showSectionTitle?: boolean }) {
    return (
        <div style={{ marginBottom: "8px" }}>
            {showSectionTitle ? <div style={cardSectionTitleStyle}>マイク設定</div> : <div style={{ ...cardSectionTitleStyle, marginBottom: "6px" }}>マイクの聞こえ方</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 6px" }}>
                <DialogToggle
                    label="ノイズを抑える"
                    help={settingHelp.enableNoiseSuppression}
                    checked={!!settings.enableNoiseSuppression}
                    disabled={uiState.enableNoiseSuppressionDisabled}
                    onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
                />
                <DialogToggle
                    label="音の回り込みを抑える"
                    help={settingHelp.enableEchoCancellation}
                    checked={!!settings.enableEchoCancellation}
                    disabled={uiState.enableEchoCancellationDisabled}
                    onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
                />
                <DialogToggle
                    label="音量を自動で整える"
                    help={settingHelp.enableAutoGainControl}
                    checked={!!settings.enableAutoGainControl}
                    disabled={uiState.enableAutoGainControlDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
                />
                <DialogToggle
                    label="無音時の送信を抑える"
                    help={settingHelp.enableVadGate}
                    checked={!!settings.enableVadGate}
                    disabled={uiState.enableVadGateDisabled}
                    onChange={(checked) => onApplySettings({ enableVadGate: checked })}
                />
                <DialogToggle
                    label="にぎやかな場所向けに調整"
                    help={settingHelp.enableVenueNoiseMode}
                    checked={!!settings.enableVenueNoiseMode}
                    disabled={uiState.enableVenueNoiseModeDisabled}
                    onChange={(checked) => onApplySettings({ enableVenueNoiseMode: checked })}
                />
            </div>
        </div>
    );
}

export function DialogCharacterSettingsSection({
    settings,
    uiState,
    uiHints,
    onApplySettings,
    showSectionTitle = true,
}: DialogCharacterSettingsSectionProps & { showSectionTitle?: boolean }) {
    return (
        <div style={{ marginBottom: "8px" }}>
            {showSectionTitle ? <div style={cardSectionTitleStyle}>キャラクター設定</div> : <div style={{ ...cardSectionTitleStyle, marginBottom: "6px" }}>キャラクター表示</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 6px" }}>
                <DialogToggle
                    label="3Dキャラクターを表示"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
                <DialogToggle
                    label="顔の向きを使う"
                    help={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <DialogToggle
                    label="自動でミュートする"
                    help={settingHelp.enableAutoMute}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </div>
            {uiHints.enableCharacterReason ? (
                <div style={{ marginTop: "4px", opacity: 0.7, lineHeight: 1.3 }}>
                    3Dキャラクター表示: {uiHints.enableCharacterReason}
                </div>
            ) : null}
            {uiHints.enableCharacterGazeReason ? (
                <div style={{ marginTop: "4px", opacity: 0.7, lineHeight: 1.3 }}>
                    顔の向き: {uiHints.enableCharacterGazeReason}
                </div>
            ) : null}
            {uiHints.enableAutoMuteReason ? (
                <div style={{ marginTop: "4px", opacity: 0.7, lineHeight: 1.3 }}>
                    自動ミュート: {uiHints.enableAutoMuteReason}
                </div>
            ) : null}
        </div>
    );
}

type DialogToggleProps = {
    label: string;
    help?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
};

function DialogToggle({ label, help, checked, disabled = false, onChange }: DialogToggleProps) {
    // dialog では compact な2列レイアウトを優先するため、Control Panel とは別スタイルの toggle を使う。
    return (
        <label
            style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minHeight: "34px",
                padding: "5px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                opacity: disabled ? 0.6 : 1,
                boxSizing: "border-box",
            }}
        >
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                style={{ margin: 0 }}
            />
            <span style={{ display: "inline-flex", alignItems: "center" }}>
                {label}
                {help ? <HelpBadge help={help} /> : null}
            </span>
        </label>
    );
}

type DialogStartupSettingsSectionProps = CommonProps & {
    startupStatus: SincroAppStartupSettingsStatus;
    startupCapabilities: SincroAppStartupSettingsCapabilities;
    isRunning: boolean;
    showSectionTitle?: boolean;
};

export function DialogStartupSettingsSection({
    settings,
    uiState,
    onApplySettings,
    startupStatus,
    startupCapabilities,
    isRunning,
    showSectionTitle = true,
}: DialogStartupSettingsSectionProps) {
    const changedLabel = startupStatus.changedKeys.length > 0 ? ` 変更: ${startupStatus.changedKeys.join(", ")}` : "";
    const items = [
        {
            key: "enableTalk" as const,
            label: "会話機能を準備する",
            checked: !!settings.enableTalk,
            disabled: uiState.enableTalkDisabled,
            supported: startupCapabilities.enableTalk,
            help: "ページを開いた時に会話機能を準備します。会話をすぐ始めたいページで使います。",
            onChange: (checked: boolean) => onApplySettings({ enableTalk: checked }),
        },
        {
            key: "enableInspector" as const,
            label: "開発者向け表示確認を使う",
            checked: !!settings.enableInspector,
            disabled: uiState.enableInspectorDisabled,
            supported: startupCapabilities.enableInspector,
            help: "開発者向けの表示確認ツールを使えるようにします。表示の切り分けが必要な時だけオンにします。",
            onChange: (checked: boolean) => onApplySettings({ enableInspector: checked }),
        },
        {
            key: "enableVR" as const,
            label: "VR で開く準備をする",
            checked: !!settings.enableVR,
            disabled: uiState.enableVRDisabled,
            supported: startupCapabilities.enableVR,
            help: "VR で開くための準備を行います。VR 対応ページを使う時だけオンにします。",
            onChange: (checked: boolean) => onApplySettings({ enableVR: checked }),
        },
    ].filter((item) => item.supported);

    return (
        <div style={{ marginBottom: "8px" }}>
            {showSectionTitle ? <div style={cardSectionTitleStyle}>開始時の動作</div> : null}
            <div className="configurationDialogReactSettingsPanel__hintText">
                {isRunning
                    ? "開始前に決まる設定です。反映したい時は、いったん停止してからもう一度始めてください。"
                    : "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。"}
            </div>
            {startupStatus.requiresRestart ? (
                <div className="configurationDialogReactSettingsPanel__hintText">
                    変更した内容を反映するには、いったん停止してからもう一度始めてください。{changedLabel}
                </div>
            ) : null}
            {!startupStatus.requiresRestart && startupStatus.willApplyOnNextStart ? (
                <div className="configurationDialogReactSettingsPanel__hintText">
                    変更した内容は次に始める時に反映されます。{changedLabel}
                </div>
            ) : null}
            <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                {items.map((item) => (
                    <label
                        key={item.key}
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            padding: "10px 11px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.04)",
                            cursor: item.disabled ? "not-allowed" : "pointer",
                            opacity: item.disabled ? 0.6 : 1,
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={item.checked}
                            disabled={item.disabled}
                            onChange={(event) => item.onChange(event.target.checked)}
                            style={{ marginTop: "2px", flexShrink: 0 }}
                        />
                        <span style={{ display: "grid", gap: "4px", lineHeight: 1.35 }}>
                            <span style={{ display: "inline-flex", alignItems: "center" }}>
                                {item.label}
                                <HelpBadge help={item.help} />
                            </span>
                        </span>
                    </label>
                ))}
            </div>
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
        <div className="configurationDialogReactSettingsPanel__hintList">
            {messages.map((message) => (
                <div key={message} className="configurationDialogReactSettingsPanel__hintText">{message}</div>
            ))}
        </div>
    );
}

function normalizeSelectedDeviceId(value: string): string | null {
    return value.trim().length > 0 ? value : null;
}
