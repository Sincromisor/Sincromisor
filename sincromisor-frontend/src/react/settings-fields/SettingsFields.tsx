import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../ts/MediaDevices/SincroMediaDeviceService";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../app/appSettingsTypes";
import {
    SettingsFieldStack,
    SettingsHelpLabel,
    SettingsHint,
    SettingsHintList,
    SettingsInput,
    SettingsRange,
    SettingsSelect,
    SettingsToggle,
    SettingsToggleGrid,
} from "../settings-primitives/SettingsPrimitives";

export const settingHelp = {
    titleText:
        "会話UIなどに表示されるタイトル文字列です。配信名・キャラクター名を表示したい時に設定します。",
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
    enableSincroPoseTracking:
        "sincro で肩・上半身・腕の動きを低振幅で反映します。重い時や姿勢検出が不安定な時はオフにできます。",
    forceSincroPoseTracking:
        "低性能端末でのデバッグ用です。姿勢推論が遅くても face-only へ自動降格せず、PoseLandmarker の出力を観測し続けます。",
    enableAutoMute:
        "顔の向きに合わせて自動でミュートを切り替えます。展示やハンズフリー運用で、話していない時を静かにしたい場面に向いています。",
    characterMotionScale:
        "呼吸、聞き姿勢、AI発話中の上半身モーションの強さです。前後の揺れが大きい時は下げます。",
    sincroPoseRetargetScale:
        "sincro の姿勢同期をキャラクターへ反映する強さです。腕や肩が動きすぎる時は下げます。",
    characterEyeTrackingScale:
        "顔位置に追従する eyeball の動きの強さです。視線が動きすぎる時は下げます。",
    enableVR: "VR で開くための準備を行います。VR 対応ページを使う時だけオンにします。",
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

type FieldContainerProps = {
    className?: string;
    style?: CSSProperties;
};

type SettingsFieldProps = FieldContainerProps & {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
};

export function normalizeSelectedDeviceId(value: string): string | null {
    return value.trim().length > 0 ? value : null;
}

export function TitleTextField({
    settings,
    uiState,
    onTitleChange,
    className,
    style,
}: SettingsFieldProps & { onTitleChange: (titleText: string) => void }) {
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel text="タイトル" help={settingHelp.titleText} />
            <SettingsInput
                type="text"
                value={settings.titleText ?? ""}
                onChange={(event) => onTitleChange(event.target.value)}
                disabled={uiState.titleTextDisabled}
            />
        </div>
    );
}

export function TalkModeField({
    settings,
    uiState,
    onTalkModeChange,
    className,
    style,
}: SettingsFieldProps & { onTalkModeChange: (talkMode: string) => void }) {
    return (
        <div className={className} style={style}>
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

export function DeviceSelectionHint({
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
        messages.push(
            `選択中の${kindLabel}は現在見つかりません。別のデバイスへ切り替えるか、既定デバイスを選んでください。`,
        );
    }
    if (selection.isAvailable && selection.matchedDevice) {
        messages.push(`選択中: ${selection.matchedDevice.label}`);
    }
    if (unavailableReason) {
        messages.push(unavailableReason);
    }
    return <SettingsHintList messages={messages} />;
}

type DeviceFieldBaseProps = FieldContainerProps & {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    uiHints: SincroAppSettingsUiHints;
    snapshot: SincroMediaDeviceSnapshot;
    selection: SincroMediaDeviceSelectionState;
    onApplySettings: ApplySettingsFn;
};

export function AudioInputDeviceField({
    settings,
    uiState,
    uiHints,
    snapshot,
    selection,
    onApplySettings,
    className,
    style,
}: DeviceFieldBaseProps) {
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel text="マイク入力" help={settingHelp.audioInputDeviceId} />
            <SettingsSelect
                value={settings.audioInputDeviceId ?? ""}
                onChange={(event) =>
                    onApplySettings({
                        audioInputDeviceId: normalizeSelectedDeviceId(event.target.value),
                    })
                }
                disabled={uiState.audioInputDeviceDisabled}
            >
                <option value="">ブラウザ既定のマイクを使う</option>
                {snapshot.audioInputs.map((option) => (
                    <option key={option.deviceId} value={option.deviceId}>
                        {option.label}
                    </option>
                ))}
            </SettingsSelect>
            <DeviceSelectionHint
                emptyMessage="利用可能なマイクが見つかりません。接続後に再読み込みしてください。"
                snapshot={snapshot}
                selection={selection}
                optionsCount={snapshot.audioInputs.length}
                unavailableReason={uiHints.audioInputDeviceReason}
                kindLabel="マイク"
            />
        </div>
    );
}

export function VideoInputDeviceField({
    settings,
    uiState,
    uiHints,
    snapshot,
    selection,
    onApplySettings,
    className,
    style,
}: DeviceFieldBaseProps) {
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel text="視線用カメラ" help={settingHelp.videoInputDeviceId} />
            <SettingsSelect
                value={settings.videoInputDeviceId ?? ""}
                onChange={(event) =>
                    onApplySettings({
                        videoInputDeviceId: normalizeSelectedDeviceId(event.target.value),
                    })
                }
                disabled={uiState.videoInputDeviceDisabled}
            >
                <option value="">ブラウザ既定のカメラを使う</option>
                {snapshot.videoInputs.map((option) => (
                    <option key={option.deviceId} value={option.deviceId}>
                        {option.label}
                    </option>
                ))}
            </SettingsSelect>
            <DeviceSelectionHint
                emptyMessage="利用可能なカメラが見つかりません。接続後に再読み込みしてください。"
                snapshot={snapshot}
                selection={selection}
                optionsCount={snapshot.videoInputs.length}
                unavailableReason={uiHints.videoInputDeviceReason}
                kindLabel="カメラ"
            />
        </div>
    );
}

type ToggleGroupProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onApplySettings: ApplySettingsFn;
    gridDensity?: "compact" | "regular";
    toggleDensity?: "compact" | "regular";
};

export function AudioProcessingToggles({
    settings,
    uiState,
    onApplySettings,
    gridDensity = "regular",
    toggleDensity = "regular",
}: ToggleGroupProps) {
    return (
        <SettingsToggleGrid density={gridDensity}>
            <SettingsToggle
                density={toggleDensity}
                label="ノイズを抑える"
                help={settingHelp.enableNoiseSuppression}
                checked={!!settings.enableNoiseSuppression}
                disabled={uiState.enableNoiseSuppressionDisabled}
                onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="音の回り込みを抑える"
                help={settingHelp.enableEchoCancellation}
                checked={!!settings.enableEchoCancellation}
                disabled={uiState.enableEchoCancellationDisabled}
                onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="音量を自動で整える"
                help={settingHelp.enableAutoGainControl}
                checked={!!settings.enableAutoGainControl}
                disabled={uiState.enableAutoGainControlDisabled}
                onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="無音時の送信を抑える"
                help={settingHelp.enableVadGate}
                checked={!!settings.enableVadGate}
                disabled={uiState.enableVadGateDisabled}
                onChange={(checked) => onApplySettings({ enableVadGate: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="にぎやかな場所向けに調整"
                help={settingHelp.enableVenueNoiseMode}
                checked={!!settings.enableVenueNoiseMode}
                disabled={uiState.enableVenueNoiseModeDisabled}
                onChange={(checked) => onApplySettings({ enableVenueNoiseMode: checked })}
            />
        </SettingsToggleGrid>
    );
}

type CharacterDisplayTogglesProps = ToggleGroupProps & {
    uiHints: SincroAppSettingsUiHints;
    renderHint?: (label: string, message: string) => ReactNode;
};

export function CharacterDisplayToggles({
    settings,
    uiState,
    uiHints,
    onApplySettings,
    gridDensity = "regular",
    toggleDensity = "regular",
    renderHint = (label, message) => (
        <SettingsHint>
            {label}: {message}
        </SettingsHint>
    ),
}: CharacterDisplayTogglesProps) {
    const hints = [
        { label: "3Dキャラクター表示", message: uiHints.enableCharacterReason },
        { label: "顔の向き", message: uiHints.enableCharacterGazeReason },
        { label: "自動ミュート", message: uiHints.enableAutoMuteReason },
    ].filter((hint): hint is { label: string; message: string } => !!hint.message);

    return (
        <>
            <SettingsToggleGrid density={gridDensity}>
                <SettingsToggle
                    density={toggleDensity}
                    label="3Dキャラクターを表示"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
                <SettingsToggle
                    density={toggleDensity}
                    label="顔の向きを使う"
                    help={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <SettingsToggle
                    density={toggleDensity}
                    label="sincroで姿勢を使う"
                    help={settingHelp.enableSincroPoseTracking}
                    checked={!!settings.enableSincroPoseTracking}
                    disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                    onChange={(checked) => onApplySettings({ enableSincroPoseTracking: checked })}
                />
                <SettingsToggle
                    density={toggleDensity}
                    label="姿勢を強制継続"
                    help={settingHelp.forceSincroPoseTracking}
                    checked={!!settings.forceSincroPoseTracking}
                    disabled={
                        uiState.forceSincroPoseTrackingDisabled ||
                        !settings.enableCharacter ||
                        !settings.enableCharacterGaze ||
                        !settings.enableSincroPoseTracking
                    }
                    onChange={(checked) => onApplySettings({ forceSincroPoseTracking: checked })}
                />
                <SettingsToggle
                    density={toggleDensity}
                    label="自動でミュートする"
                    help={settingHelp.enableAutoMute}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </SettingsToggleGrid>
            <SettingsFieldStack spacing="compact">
                <SettingsRange
                    label="上半身モーション"
                    help={settingHelp.characterMotionScale}
                    min={0}
                    max={1.2}
                    step={0.05}
                    value={settings.characterMotionScale}
                    valueLabel={`${Math.round(settings.characterMotionScale * 100)}%`}
                    disabled={!settings.enableCharacter}
                    onChange={(value) => onApplySettings({ characterMotionScale: value })}
                />
                <SettingsRange
                    label="姿勢同期"
                    help={settingHelp.sincroPoseRetargetScale}
                    min={0}
                    max={1.2}
                    step={0.05}
                    value={settings.sincroPoseRetargetScale}
                    valueLabel={`${Math.round(settings.sincroPoseRetargetScale * 100)}%`}
                    disabled={
                        !settings.enableCharacter ||
                        !settings.enableCharacterGaze ||
                        !settings.enableSincroPoseTracking
                    }
                    onChange={(value) => onApplySettings({ sincroPoseRetargetScale: value })}
                />
                <SettingsRange
                    label="目線追跡"
                    help={settingHelp.characterEyeTrackingScale}
                    min={0}
                    max={1.2}
                    step={0.05}
                    value={settings.characterEyeTrackingScale}
                    valueLabel={`${Math.round(settings.characterEyeTrackingScale * 100)}%`}
                    disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                    onChange={(value) => onApplySettings({ characterEyeTrackingScale: value })}
                />
            </SettingsFieldStack>
            {hints.map((hint) => (
                <Fragment key={hint.label}>{renderHint(hint.label, hint.message)}</Fragment>
            ))}
        </>
    );
}

type StartupBehaviorFieldsProps = ToggleGroupProps & {
    startupStatus: SincroAppStartupSettingsStatus;
    startupCapabilities: SincroAppStartupSettingsCapabilities;
    isRunning: boolean;
    introText?: {
        running: string;
        stopped: string;
    };
    renderHint?: (message: string, tone?: "muted" | "info" | "warning") => ReactNode;
    useFieldStack?: boolean;
    enableVrLabel?: string;
};

export function StartupBehaviorFields({
    settings,
    uiState,
    onApplySettings,
    startupStatus,
    startupCapabilities,
    isRunning,
    introText = {
        running:
            "開始前に決まる設定です。反映したい時は、いったん停止してからもう一度始めてください。",
        stopped: "開始した時の動きを決めます。必要なものだけオンにしてから始めてください。",
    },
    renderHint = (message, tone) => <SettingsHint tone={tone}>{message}</SettingsHint>,
    useFieldStack = true,
    enableVrLabel = "VRで開く準備をする",
    gridDensity = "regular",
    toggleDensity = "regular",
}: StartupBehaviorFieldsProps) {
    const changedLabel =
        startupStatus.changedKeys.length > 0
            ? ` 変更: ${startupStatus.changedKeys.join(", ")}`
            : "";
    const items = [
        {
            key: "enableVR" as const,
            label: enableVrLabel,
            checked: !!settings.enableVR,
            disabled: uiState.enableVRDisabled,
            supported: startupCapabilities.enableVR,
            help: settingHelp.enableVR,
            onChange: (checked: boolean) => onApplySettings({ enableVR: checked }),
        },
    ].filter((item) => item.supported);

    if (items.length === 0) {
        return null;
    }

    const toggles = (
        <SettingsToggleGrid density={gridDensity}>
            {items.map((item) => (
                <SettingsToggle
                    key={item.key}
                    density={toggleDensity}
                    label={item.label}
                    help={item.help}
                    checked={item.checked}
                    disabled={item.disabled}
                    onChange={item.onChange}
                />
            ))}
        </SettingsToggleGrid>
    );

    return (
        <>
            {renderHint(isRunning ? introText.running : introText.stopped)}
            {startupStatus.requiresRestart
                ? renderHint(
                      `変更した内容を反映するには、いったん停止してからもう一度始めてください。${changedLabel}`,
                      "warning",
                  )
                : null}
            {!startupStatus.requiresRestart && startupStatus.willApplyOnNextStart
                ? renderHint(`変更した内容は次に始める時に反映されます。${changedLabel}`, "info")
                : null}
            {useFieldStack ? <SettingsFieldStack>{toggles}</SettingsFieldStack> : toggles}
        </>
    );
}
