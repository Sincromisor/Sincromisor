import { useState } from "react";
import type { ReactNode } from "react";
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
import {
    SettingsButton,
    SettingsFieldStack,
    SettingsHelpLabel,
    SettingsHint,
    SettingsHintList,
    SettingsInput,
    SettingsSectionCard,
    SettingsSelect,
    SettingsSubsectionTitle,
    SettingsToggle,
    SettingsToggleGrid,
} from "../../settings-primitives/SettingsPrimitives";

// 起動前 dialog 専用の文言と表示対象を保持し、見た目は settings-primitives に委譲する。
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

type DialogSettingsCategoryProps = {
    title?: string;
    description?: string;
    children: ReactNode;
};

export function DialogSettingsCategory({
    title,
    description,
    children,
}: DialogSettingsCategoryProps) {
    return (
        <SettingsSectionCard title={title} description={description}>
            {children}
        </SettingsSectionCard>
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
        <div className="settingsPrimitiveFieldStack">
            {showSectionTitle ? <SettingsSubsectionTitle>基本設定</SettingsSubsectionTitle> : null}
            <div>
                <SettingsHelpLabel text="タイトル" help={settingHelp.titleText} />
                <SettingsInput
                    type="text"
                    value={settings.titleText ?? ""}
                    onChange={(event) => onTitleChange(event.target.value)}
                    disabled={uiState.titleTextDisabled}
                />
            </div>
            <div>
                <SettingsHelpLabel text="トークモード (talk mode)" help={settingHelp.talkMode} />
                <SettingsSelect
                    value={settings.talkMode}
                    onChange={(event) => onTalkModeChange(event.target.value)}
                    disabled={uiState.talkModeDisabled}
                >
                    <option value="chat">chat</option>
                    <option value="sincro">sincro</option>
                </SettingsSelect>
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
        <div className="settingsPrimitiveFieldStack">
            <SettingsSubsectionTitle
                actions={(
                    <SettingsButton
                        type="button"
                        onClick={handleRefreshDevices}
                        disabled={snapshot.isRefreshing}
                    >
                        {snapshot.isRefreshing ? "更新中..." : "再読み込み"}
                    </SettingsButton>
                )}
            >
                {showSectionTitle ? "入力デバイス" : "マイクとカメラ"}
            </SettingsSubsectionTitle>
            <div>
                <SettingsHelpLabel text="マイク入力" help={settingHelp.audioInputDeviceId} />
                <SettingsSelect
                    value={settings.audioInputDeviceId ?? ""}
                    onChange={(event) => onApplySettings({ audioInputDeviceId: normalizeSelectedDeviceId(event.target.value) })}
                    disabled={uiState.audioInputDeviceDisabled}
                >
                    <option value="">ブラウザ既定のマイクを使う</option>
                    {snapshot.audioInputs.map((option) => (
                        <option key={option.deviceId} value={option.deviceId}>{option.label}</option>
                    ))}
                </SettingsSelect>
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
                <SettingsHelpLabel text="視線用カメラ" help={settingHelp.videoInputDeviceId} />
                <SettingsSelect
                    value={settings.videoInputDeviceId ?? ""}
                    onChange={(event) => onApplySettings({ videoInputDeviceId: normalizeSelectedDeviceId(event.target.value) })}
                    disabled={uiState.videoInputDeviceDisabled}
                >
                    <option value="">ブラウザ既定のカメラを使う</option>
                    {snapshot.videoInputs.map((option) => (
                        <option key={option.deviceId} value={option.deviceId}>{option.label}</option>
                    ))}
                </SettingsSelect>
                <DeviceSelectionHint
                    emptyMessage="利用可能なカメラが見つかりません。接続後に再読み込みしてください。"
                    snapshot={snapshot}
                    selection={videoInputSelection}
                    optionsCount={snapshot.videoInputs.length}
                    unavailableReason={uiHints.videoInputDeviceReason}
                    kindLabel="カメラ"
                />
            </div>
            {refreshMessage ? <SettingsHint>{refreshMessage}</SettingsHint> : null}
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
        <div className="settingsPrimitiveFieldStack">
            <SettingsSubsectionTitle>
                {showSectionTitle ? "マイク設定" : "マイクの聞こえ方"}
            </SettingsSubsectionTitle>
            <SettingsToggleGrid density="compact">
                <SettingsToggle
                    density="compact"
                    label="ノイズを抑える"
                    help={settingHelp.enableNoiseSuppression}
                    checked={!!settings.enableNoiseSuppression}
                    disabled={uiState.enableNoiseSuppressionDisabled}
                    onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
                />
                <SettingsToggle
                    density="compact"
                    label="音の回り込みを抑える"
                    help={settingHelp.enableEchoCancellation}
                    checked={!!settings.enableEchoCancellation}
                    disabled={uiState.enableEchoCancellationDisabled}
                    onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
                />
                <SettingsToggle
                    density="compact"
                    label="音量を自動で整える"
                    help={settingHelp.enableAutoGainControl}
                    checked={!!settings.enableAutoGainControl}
                    disabled={uiState.enableAutoGainControlDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
                />
                <SettingsToggle
                    density="compact"
                    label="無音時の送信を抑える"
                    help={settingHelp.enableVadGate}
                    checked={!!settings.enableVadGate}
                    disabled={uiState.enableVadGateDisabled}
                    onChange={(checked) => onApplySettings({ enableVadGate: checked })}
                />
                <SettingsToggle
                    density="compact"
                    label="にぎやかな場所向けに調整"
                    help={settingHelp.enableVenueNoiseMode}
                    checked={!!settings.enableVenueNoiseMode}
                    disabled={uiState.enableVenueNoiseModeDisabled}
                    onChange={(checked) => onApplySettings({ enableVenueNoiseMode: checked })}
                />
            </SettingsToggleGrid>
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
        <div className="settingsPrimitiveFieldStack">
            <SettingsSubsectionTitle>
                {showSectionTitle ? "キャラクター設定" : "キャラクター表示"}
            </SettingsSubsectionTitle>
            <SettingsToggleGrid density="compact">
                <SettingsToggle
                    density="compact"
                    label="3Dキャラクターを表示"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
                <SettingsToggle
                    density="compact"
                    label="顔の向きを使う"
                    help={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <SettingsToggle
                    density="compact"
                    label="自動でミュートする"
                    help={settingHelp.enableAutoMute}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </SettingsToggleGrid>
            {uiHints.enableCharacterReason ? <SettingsHint>3Dキャラクター表示: {uiHints.enableCharacterReason}</SettingsHint> : null}
            {uiHints.enableCharacterGazeReason ? <SettingsHint>顔の向き: {uiHints.enableCharacterGazeReason}</SettingsHint> : null}
            {uiHints.enableAutoMuteReason ? <SettingsHint>自動ミュート: {uiHints.enableAutoMuteReason}</SettingsHint> : null}
        </div>
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
            key: "enableVR" as const,
            label: "VR で開く準備をする",
            checked: !!settings.enableVR,
            disabled: uiState.enableVRDisabled,
            supported: startupCapabilities.enableVR,
            help: "VR で開くための準備を行います。VR 対応ページを使う時だけオンにします。",
            onChange: (checked: boolean) => onApplySettings({ enableVR: checked }),
        },
    ].filter((item) => item.supported);

    if (items.length === 0) {
        return null;
    }

    return (
        <div className="settingsPrimitiveFieldStack">
            {showSectionTitle ? <SettingsSubsectionTitle>開始時の動作</SettingsSubsectionTitle> : null}
            <SettingsHint>
                {isRunning
                    ? "開始前に決まる設定です。反映したい時は、いったん停止してからもう一度始めてください。"
                    : "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。"}
            </SettingsHint>
            {startupStatus.requiresRestart ? (
                <SettingsHint>
                    変更した内容を反映するには、いったん停止してからもう一度始めてください。{changedLabel}
                </SettingsHint>
            ) : null}
            {!startupStatus.requiresRestart && startupStatus.willApplyOnNextStart ? (
                <SettingsHint>
                    変更した内容は次に始める時に反映されます。{changedLabel}
                </SettingsHint>
            ) : null}
            <SettingsFieldStack>
                {items.map((item) => (
                    <SettingsToggle
                        key={item.key}
                        label={item.label}
                        help={item.help}
                        checked={item.checked}
                        disabled={item.disabled}
                        onChange={item.onChange}
                    />
                ))}
            </SettingsFieldStack>
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
    return <SettingsHintList messages={messages} />;
}

function normalizeSelectedDeviceId(value: string): string | null {
    return value.trim().length > 0 ? value : null;
}
