import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
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
    talkMode: "応答モードを切り替えます。通常会話用途では chat、同期的なやり取りや Sincromisor 想定フローでは sincro を使う想定です。",
    audioInputDeviceId: "起動時に使うマイク入力デバイスです。未選択ならブラウザ既定の入力デバイスを利用します。",
    videoInputDeviceId: "視線検出に使うカメラです。未選択ならブラウザ既定のカメラを利用します。",
    enableNoiseSuppression: "Noise Suppression。周囲の定常ノイズを抑えます。家庭・オフィス環境で雑音が気になる時に有効化を推奨します。",
    enableEchoCancellation: "Echo Cancellation。スピーカー音の回り込みを抑えます。ヘッドホン未使用時やスピーカー再生時に有効化を推奨します。",
    enableAutoGainControl: "Auto Gain Control。入力音量を自動補正します。マイク音量が不安定な環境で有効化を推奨します。",
    enableVadGate: "VAD Gate。無音区間の送信を抑えて誤反応を減らします。雑音で反応しやすい場合に有効化を推奨します。",
    enableVenueNoiseMode: "会場ノイズ向けモード。イベント会場や広い空間など、反射音・環境音が多い場面での利用を想定しています。",
    enableCharacter: "3Dキャラクター表示の有効/無効です。描画負荷を下げたい場合や音声動作だけ確認したい場合は無効化します。",
    enableCharacterGaze: "Gaze（視線・顔向き推定）を有効化します。カメラ連動演出や AutoMute と連携したい場合に有効化を推奨します。",
    enableAutoMute: "顔の向きなどに応じて自動的に mute を切り替えます。ハンズフリー運用や展示用途で便利です（Gaze 有効時を推奨）。",
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

export function DialogBasicSettingsSection({
    settings,
    uiState,
    onTitleChange,
    onTalkModeChange,
}: DialogBasicSettingsSectionProps) {
    return (
        <div style={{ marginTop: "4px", marginBottom: "8px" }}>
            <div style={cardSectionTitleStyle}>基本設定</div>
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
            <div style={{ ...cardSectionTitleStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span>入力デバイス</span>
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
                ここで選んだデバイスは設定パネルと共通です。配信前の確定や復帰はこの画面から行えます。
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

export function DialogMicSettingsSection({ settings, uiState, onApplySettings }: CommonProps) {
    return (
        <div style={{ marginBottom: "8px" }}>
            <div style={cardSectionTitleStyle}>マイク設定</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 6px" }}>
                <DialogToggle
                    label="NS"
                    help={settingHelp.enableNoiseSuppression}
                    checked={!!settings.enableNoiseSuppression}
                    disabled={uiState.enableNoiseSuppressionDisabled}
                    onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
                />
                <DialogToggle
                    label="EC"
                    help={settingHelp.enableEchoCancellation}
                    checked={!!settings.enableEchoCancellation}
                    disabled={uiState.enableEchoCancellationDisabled}
                    onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
                />
                <DialogToggle
                    label="AGC"
                    help={settingHelp.enableAutoGainControl}
                    checked={!!settings.enableAutoGainControl}
                    disabled={uiState.enableAutoGainControlDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
                />
                <DialogToggle
                    label="VAD Gate"
                    help={settingHelp.enableVadGate}
                    checked={!!settings.enableVadGate}
                    disabled={uiState.enableVadGateDisabled}
                    onChange={(checked) => onApplySettings({ enableVadGate: checked })}
                />
                <DialogToggle
                    label="Venue"
                    help={settingHelp.enableVenueNoiseMode}
                    checked={!!settings.enableVenueNoiseMode}
                    disabled={uiState.enableVenueNoiseModeDisabled}
                    onChange={(checked) => onApplySettings({ enableVenueNoiseMode: checked })}
                />
            </div>
        </div>
    );
}

export function DialogCharacterSettingsSection({ settings, uiState, uiHints, onApplySettings }: DialogCharacterSettingsSectionProps) {
    return (
        <div style={{ marginBottom: "8px" }}>
            <div style={cardSectionTitleStyle}>キャラクター設定</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 6px" }}>
                <DialogToggle
                    label="Character"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
                <DialogToggle
                    label="Gaze"
                    help={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <DialogToggle
                    label="AutoMute"
                    help={settingHelp.enableAutoMute}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </div>
            {uiHints.enableCharacterReason ? (
                <div style={{ marginTop: "4px", opacity: 0.7, lineHeight: 1.3 }}>
                    キャラクター: {uiHints.enableCharacterReason}
                </div>
            ) : null}
            {uiHints.enableCharacterGazeReason ? (
                <div style={{ marginTop: "4px", opacity: 0.7, lineHeight: 1.3 }}>
                    Gaze: {uiHints.enableCharacterGazeReason}
                </div>
            ) : null}
            {uiHints.enableAutoMuteReason ? (
                <div style={{ marginTop: "4px", opacity: 0.7, lineHeight: 1.3 }}>
                    AutoMute: {uiHints.enableAutoMuteReason}
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
