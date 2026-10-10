import type { ReactNode } from "react";
import type { ApplySettingsFn } from "../../../../app/controller";
import type { SincroAppControllerSettingsState } from "../../../../app/react/useSincroAppControllerSettingsState";
import type {
    SincroMediaDeviceSelectionState,
    SincroMediaDeviceSnapshot,
} from "../../../media/devices/sincroMediaDeviceService";
import { ResetSettingsButton } from "../actions/resetSettingsButton";
import { AutoMuteField } from "../fields/autoMuteField";
import { CameraTrackingFields } from "../fields/cameraTrackingFields";
import {
    AudioInputDeviceField,
    AudioProcessingToggles,
    CharacterDisplayToggles,
    TalkModeField,
    TitleTextField,
    VideoInputDeviceField,
} from "../fields/settingsFields";
import { SettingsButton, SettingsHint } from "../primitives/settingsPrimitives";
import { useSettingsDeviceRefresh } from "../sections/settingsDeviceRefresh";
import { createCoreSettingsPages } from "./coreSettingsPages";

/** 起動前後の購読値を入力部品へ渡す境界。値や機器の状態をここでは所有しない。 */
export type PurposeSettingsState = Pick<
    SincroAppControllerSettingsState,
    "settings" | "settingsUiState" | "settingsUiHints"
> & {
    applySettings: ApplySettingsFn;
    changeTalkMode: (mode: string) => void;
    mediaDeviceSnapshot: SincroMediaDeviceSnapshot;
    audioInputSelection: SincroMediaDeviceSelectionState;
    videoInputSelection: SincroMediaDeviceSelectionState;
    refreshDevices: () => Promise<SincroMediaDeviceSnapshot>;
};

type PurposeSettingsOptions = {
    state: PurposeSettingsState;
    character: ReactNode;
    camera?: ReactNode;
    experience?: ReactNode;
};

/** 共通の5分類へ入力を一度だけ定義し、VRM・較正など場面固有の操作を差し込む。 */
export function createPurposeSettingsPages({
    state,
    character,
    camera,
    experience,
}: PurposeSettingsOptions) {
    const fields = {
        settings: state.settings,
        uiState: state.settingsUiState,
        uiHints: state.settingsUiHints,
        onApplySettings: state.applySettings,
    };
    return createCoreSettingsPages({
        experience: (
            <>
                <ExperienceSettingsFields state={state} />
                {experience}
            </>
        ),
        character: (
            <>
                {character}
                <CharacterDisplayToggles {...fields} />
            </>
        ),
        audio: (
            <>
                <PurposeDeviceField state={state} kind="audio" />
                <AudioProcessingToggles {...fields} />
                <AutoMuteField {...fields} />
            </>
        ),
        camera: (
            <>
                <PurposeDeviceField state={state} kind="video" />
                <CameraTrackingFields {...fields} />
                {camera}
            </>
        ),
        screen: (
            <>
                <TitleTextField
                    {...fields}
                    onTitleChange={(titleText) => state.applySettings({ titleText })}
                />
                <SettingsHint>設定はこのブラウザーに自動で保存されます。</SettingsHint>
                <ResetSettingsButton />
            </>
        ),
    });
}

/** 内部のchat/sincro値を保ったまま、利用者向けの体験名と説明を表示する。 */
export function ExperienceSettingsFields({ state }: { state: PurposeSettingsState }) {
    return (
        <TalkModeField
            settings={state.settings}
            uiState={state.settingsUiState}
            onTalkModeChange={state.changeTalkMode}
        />
    );
}

/** 各入力分類に機器選択と一覧更新を置き、利用不可理由は既存フィールドへ委譲する。 */
export function PurposeDeviceField({
    state,
    kind,
}: {
    state: PurposeSettingsState;
    kind: "audio" | "video";
}) {
    const { refreshMessage, handleRefreshDevices } = useSettingsDeviceRefresh(state.refreshDevices);
    const Field = kind === "audio" ? AudioInputDeviceField : VideoInputDeviceField;
    return (
        <div className="settingsPrimitiveFieldStack">
            <Field
                settings={state.settings}
                uiState={state.settingsUiState}
                uiHints={state.settingsUiHints}
                snapshot={state.mediaDeviceSnapshot}
                selection={kind === "audio" ? state.audioInputSelection : state.videoInputSelection}
                onApplySettings={state.applySettings}
            />
            <SettingsButton
                type="button"
                onClick={handleRefreshDevices}
                disabled={state.mediaDeviceSnapshot.isRefreshing}
            >
                {state.mediaDeviceSnapshot.isRefreshing ? "更新中..." : "機器一覧を更新"}
            </SettingsButton>
            {refreshMessage ? <SettingsHint>{refreshMessage}</SettingsHint> : null}
        </div>
    );
}
