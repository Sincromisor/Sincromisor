import { useId } from "react";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../../media/devices/sincroMediaDeviceService";
import {
    SettingsHelpLabel,
    SettingsHintList,
    SettingsSelect,
} from "../primitives/settingsPrimitives";
import type { DeviceFieldBaseProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

type DeviceSelectionHintProps = {
    emptyMessage: string;
    snapshot: SincroMediaDeviceSnapshot;
    selection: SincroMediaDeviceSelectionState;
    optionsCount: number;
    unavailableReason?: string;
    kindLabel: string;
};

/** 空の選択値を、既定機器へ戻す設定APIの値へ変換する。 */
export function normalizeSelectedDeviceId(value: string): string | undefined {
    return value.trim().length > 0 ? value : undefined;
}

/** 機器列挙と選択状態のスナップショットから、入力直下の利用案内を作る。 */
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
    if (unavailableReason) {
        messages.push(unavailableReason);
    }
    return <SettingsHintList messages={messages} />;
}

/** 不在の選択機器も選択肢に残し、ブラウザーが既定機器へ戻ったように表示するのを防ぐ。 */
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
    const inputId = useId();
    const hintId = useId();
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel
                htmlFor={inputId}
                text="マイク入力"
                help={settingHelp.audioInputDeviceId}
            />
            <SettingsSelect
                id={inputId}
                aria-describedby={hintId}
                value={settings.audioInputDeviceId ?? ""}
                onChange={(event) =>
                    onApplySettings({
                        audioInputDeviceId: normalizeSelectedDeviceId(event.target.value),
                    })
                }
                disabled={uiState.audioInputDeviceDisabled}
            >
                <option value="">ブラウザ既定のマイクを使う</option>
                {settings.audioInputDeviceId &&
                    !snapshot.audioInputs.some(
                        (item) => item.deviceId === settings.audioInputDeviceId,
                    ) && (
                        <option value={settings.audioInputDeviceId} disabled>
                            選択中のマイク（一覧にありません）
                        </option>
                    )}
                {snapshot.audioInputs.map((option) => (
                    <option key={option.deviceId} value={option.deviceId}>
                        {option.label}
                    </option>
                ))}
            </SettingsSelect>
            <div id={hintId}>
                <DeviceSelectionHint
                    emptyMessage="利用可能なマイクが見つかりません。接続後に「機器一覧を更新」を押してください。"
                    snapshot={snapshot}
                    selection={selection}
                    optionsCount={snapshot.audioInputs.length}
                    unavailableReason={uiHints.audioInputDeviceReason}
                    kindLabel="マイク"
                />
            </div>
        </div>
    );
}

/** 不在の選択機器も選択肢に残し、ブラウザーが既定機器へ戻ったように表示するのを防ぐ。 */
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
    const inputId = useId();
    const hintId = useId();
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel
                htmlFor={inputId}
                text="追跡用カメラ"
                help={settingHelp.videoInputDeviceId}
            />
            <SettingsSelect
                id={inputId}
                aria-describedby={hintId}
                value={settings.videoInputDeviceId ?? ""}
                onChange={(event) =>
                    onApplySettings({
                        videoInputDeviceId: normalizeSelectedDeviceId(event.target.value),
                    })
                }
                disabled={uiState.videoInputDeviceDisabled}
            >
                <option value="">ブラウザ既定のカメラを使う</option>
                {settings.videoInputDeviceId &&
                    !snapshot.videoInputs.some(
                        (item) => item.deviceId === settings.videoInputDeviceId,
                    ) && (
                        <option value={settings.videoInputDeviceId} disabled>
                            選択中のカメラ（一覧にありません）
                        </option>
                    )}
                {snapshot.videoInputs.map((option) => (
                    <option key={option.deviceId} value={option.deviceId}>
                        {option.label}
                    </option>
                ))}
            </SettingsSelect>
            <div id={hintId}>
                <DeviceSelectionHint
                    emptyMessage="利用可能なカメラが見つかりません。接続後に「機器一覧を更新」を押してください。"
                    snapshot={snapshot}
                    selection={selection}
                    optionsCount={snapshot.videoInputs.length}
                    unavailableReason={uiHints.videoInputDeviceReason}
                    kindLabel="カメラ"
                />
            </div>
        </div>
    );
}
