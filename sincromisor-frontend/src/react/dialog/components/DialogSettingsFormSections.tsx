import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../../app/appSettingsTypes";

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
    enableNoiseSuppression: "Noise Suppression。周囲の定常ノイズを抑えます。家庭・オフィス環境で雑音が気になる時に有効化を推奨します。",
    enableEchoCancellation: "Echo Cancellation。スピーカー音の回り込みを抑えます。ヘッドホン未使用時やスピーカー再生時に有効化を推奨します。",
    enableAutoGainControl: "Auto Gain Control。入力音量を自動補正します。マイク音量が不安定な環境で有効化を推奨します。",
    enableVadGate: "VAD Gate。無音区間の送信を抑えて誤反応を減らします。雑音で反応しやすい場合に有効化を推奨します。",
    enableVenueNoiseMode: "会場ノイズ向けモード。イベント会場や広い空間など、反射音・環境音が多い場面での利用を想定しています。",
    enableCharacter: "3Dキャラクター表示の有効/無効です。描画負荷を下げたい場合や音声動作だけ確認したい場合は無効化します。",
    enableCharacterGaze: "Gaze（視線・顔向き推定）を有効化します。カメラ連動演出や AutoMute と連携したい場合に有効化を推奨します。",
    enableAutoMute: "顔の向きなどに応じて自動的に mute を切り替えます。ハンズフリー運用や展示用途で便利です（Gaze 有効時を推奨）。",
} as const;

const tooltipBubbleStyle: CSSProperties = {
    position: "absolute",
    right: 0,
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
