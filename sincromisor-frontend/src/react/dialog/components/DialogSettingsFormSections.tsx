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
    SettingsHint,
    SettingsSectionCard,
    SettingsSubsectionTitle,
} from "../../settings-primitives/SettingsPrimitives";
import {
    AudioInputDeviceField,
    AudioProcessingToggles,
    CharacterDisplayToggles,
    StartupBehaviorFields,
    TalkModeField,
    TitleTextField,
    VideoInputDeviceField,
} from "../../settings-fields/SettingsFields";

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
            <TitleTextField settings={settings} uiState={uiState} onTitleChange={onTitleChange} />
            <TalkModeField settings={settings} uiState={uiState} onTalkModeChange={onTalkModeChange} />
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
            <AudioInputDeviceField
                settings={settings}
                uiState={uiState}
                uiHints={uiHints}
                snapshot={snapshot}
                selection={audioInputSelection}
                onApplySettings={onApplySettings}
            />
            <VideoInputDeviceField
                settings={settings}
                uiState={uiState}
                uiHints={uiHints}
                snapshot={snapshot}
                selection={videoInputSelection}
                onApplySettings={onApplySettings}
            />
            {refreshMessage ? <SettingsHint>{refreshMessage}</SettingsHint> : null}
        </div>
    );
}

export function DialogMicSettingsSection({
    settings,
    uiState,
    onApplySettings,
    showSectionTitle = true,
    sectionTitle = showSectionTitle ? "マイク設定" : "マイクの聞こえ方",
}: CommonProps & { showSectionTitle?: boolean; sectionTitle?: string }) {
    return (
        <div className="settingsPrimitiveFieldStack">
            {sectionTitle ? <SettingsSubsectionTitle>{sectionTitle}</SettingsSubsectionTitle> : null}
            <AudioProcessingToggles
                settings={settings}
                uiState={uiState}
                onApplySettings={onApplySettings}
                gridDensity="compact"
                toggleDensity="compact"
            />
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
            <CharacterDisplayToggles
                settings={settings}
                uiState={uiState}
                uiHints={uiHints}
                onApplySettings={onApplySettings}
                gridDensity="compact"
                toggleDensity="compact"
            />
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
    if (!startupCapabilities.enableVR) {
        return null;
    }

    return (
        <div className="settingsPrimitiveFieldStack">
            {showSectionTitle ? <SettingsSubsectionTitle>開始時の動作</SettingsSubsectionTitle> : null}
            <StartupBehaviorFields
                settings={settings}
                uiState={uiState}
                onApplySettings={onApplySettings}
                startupStatus={startupStatus}
                startupCapabilities={startupCapabilities}
                isRunning={isRunning}
                enableVrLabel="VR で開く準備をする"
            />
        </div>
    );
}
