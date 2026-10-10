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
    if (selection.isAvailable && selection.matchedDevice) {
        messages.push(`選択中: ${selection.matchedDevice.label}`);
    }
    if (unavailableReason) {
        messages.push(unavailableReason);
    }
    return <SettingsHintList messages={messages} />;
}

/** 項目名を入力へ関連付け、変更を共通設定の適用窓口へ渡す。 */
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
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel
                htmlFor={inputId}
                text="マイク入力"
                help={settingHelp.audioInputDeviceId}
            />
            <SettingsSelect
                id={inputId}
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

/** 項目名を入力へ関連付け、変更を共通設定の適用窓口へ渡す。 */
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
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel
                htmlFor={inputId}
                text="追跡用カメラ"
                help={settingHelp.videoInputDeviceId}
            />
            <SettingsSelect
                id={inputId}
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
