import type { ChangeEvent, DragEvent } from "react";
import { useRef } from "react";
import { SettingsShell } from "../settings-shell/SettingsShell";
import { settingsPageCopy } from "../settings-shell/settingsPageCopy";
import { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";
import "./configurationDialogSettings.css";
import {
    DialogVrmDropStatusCard,
    VrmModelSection,
} from "./components/DialogSettingsSections";
import {
    DialogSettingsCategory,
    DialogBasicSettingsSection,
    DialogCharacterSettingsSection,
    DialogDeviceSettingsSection,
    DialogMicSettingsSection,
    DialogStartupSettingsSection,
} from "./components/DialogSettingsFormSections";

function connectionStatusLabel(value: string): string {
    switch (value) {
        case "connected":
            return "接続済み";
        case "starting":
            return "開始準備中";
        case "connecting":
            return "接続中";
        case "degraded":
            return "要確認";
        case "stopping":
            return "停止中";
        case "stopped":
        case "idle":
            return "未接続";
        default:
            return value;
    }
}

function hasFileDragPayload(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) {
        return false;
    }
    return Array.from(dataTransfer.types).includes("Files");
}

// 起動前 dialog の見た目/操作を React 側で主導する設定パネル。
// HTMLDialogElement 以外の visible UI と VRM file 操作は React 正規経路に寄せる。
export function ConfigurationDialogSettingsPanel() {
    const {
        currentController,
        lifecycleState,
        connectionState,
        settings,
        settingsUiState,
        settingsUiHints,
        startupSettingsStatus,
        startupSettingsCapabilities,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
        applySettings,
        changeTalkMode,
        dialogVrmUiState,
        dialogUiState,
        applySelectedVrmFile,
        setVrmDragOver,
        startApp,
    } = useConfigurationDialogSettingsState();
    const vrmFileInputRef = useRef<HTMLInputElement | null>(null);
    const dragDepthRef = useRef(0);

    const hasStartupOptions = startupSettingsCapabilities.enableVR;
    const connectionDetail = connectionState.detail || "";
    const startupOptionHint = startupSettingsStatus.changedKeys.length > 0
        ? `開始前だけ効く項目に変更があります: ${startupSettingsStatus.changedKeys.join(", ")}`
        : "";
    const startButtonLabel = dialogUiState.startButtonText || "開始する";
    const startButtonHint = dialogUiState.startButtonHint ?? "";

    const resetDragState = (): void => {
        dragDepthRef.current = 0;
        setVrmDragOver(false);
    };

    const handleOpenVrmFilePicker = (): void => {
        const input = vrmFileInputRef.current;
        if (!input) {
            return;
        }
        // 同じファイルを選び直した時も change が発火するよう、click 前に値を空に戻す。
        input.value = "";
        input.click();
    };

    const handleVrmFileInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.currentTarget.files?.[0];
        if (!file) {
            return;
        }
        applySelectedVrmFile(file);
        event.currentTarget.value = "";
    };

    const handleDialogDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        dragDepthRef.current += 1;
        setVrmDragOver(true);
    };

    const handleDialogDragOver = (event: DragEvent<HTMLDivElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dialogVrmUiState.isDragOver) {
            setVrmDragOver(true);
        }
    };

    const handleDialogDragLeave = (event: DragEvent<HTMLDivElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
            setVrmDragOver(false);
        }
    };

    const handleDialogDrop = (event: DragEvent<HTMLDivElement>): void => {
        if (!hasFileDragPayload(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        resetDragState();
        if (file) {
            applySelectedVrmFile(file);
        }
    };

    return (
        <div
            className={`configurationDialogReactSettingsPanel${dialogVrmUiState.isDragOver ? " is-dragover" : ""}`}
            onDragEnter={handleDialogDragEnter}
            onDragOver={handleDialogDragOver}
            onDragLeave={handleDialogDragLeave}
            onDrop={handleDialogDrop}
        >
            <input
                ref={vrmFileInputRef}
                type="file"
                accept=".vrm"
                className="configurationDialogReactSettingsPanel__fileInput"
                tabIndex={-1}
                onChange={handleVrmFileInputChange}
            />
            <SettingsShell
                ariaLabel="初回セットアップウィザード"
                title="初回セットアップ"
                initialPageId="conversation"
                pages={[
                    {
                        id: "conversation",
                        label: settingsPageCopy.conversation.label,
                        title: settingsPageCopy.conversation.title,
                        content: (
                            <DialogSettingsCategory
                                title={settingsPageCopy.conversation.sectionTitle}
                            >
                                <DialogBasicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onTitleChange={(titleText) => applySettings({ titleText })}
                                    onTalkModeChange={changeTalkMode}
                                    showSectionTitle={false}
                                />
                            </DialogSettingsCategory>
                        ),
                    },
                    {
                        id: "devices",
                        label: settingsPageCopy.devices.label,
                        title: settingsPageCopy.devices.title,
                        content: (
                            <DialogSettingsCategory
                                title={settingsPageCopy.devices.sectionTitle}
                            >
                                <DialogDeviceSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    uiHints={settingsUiHints}
                                    snapshot={mediaDeviceSnapshot}
                                    audioInputSelection={audioInputSelection}
                                    videoInputSelection={videoInputSelection}
                                    onApplySettings={applySettings}
                                    onRefreshDevices={refreshDevices}
                                    showSectionTitle={false}
                                />
                            </DialogSettingsCategory>
                        ),
                    },
                    {
                        id: "audio",
                        label: settingsPageCopy.audio.label,
                        title: settingsPageCopy.audio.title,
                        description: settingsPageCopy.audio.description,
                        content: (
                            <DialogSettingsCategory>
                                <DialogMicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onApplySettings={applySettings}
                                    showSectionTitle={false}
                                    sectionTitle={settingsPageCopy.audio.sectionTitle}
                                />
                            </DialogSettingsCategory>
                        ),
                    },
                    {
                        id: "display",
                        label: settingsPageCopy.display.label,
                        title: settingsPageCopy.display.title,
                        content: (
                            <>
                                <DialogSettingsCategory
                                    title={settingsPageCopy.display.sectionTitle}
                                >
                                    <DialogCharacterSettingsSection
                                        settings={settings}
                                        uiState={settingsUiState}
                                        uiHints={settingsUiHints}
                                        onApplySettings={applySettings}
                                        showSectionTitle={false}
                                    />
                                </DialogSettingsCategory>
                                <DialogSettingsCategory
                                    title={settingsPageCopy.display.vrmSectionTitle}
                                >
                                    <VrmModelSection onOpenFilePicker={handleOpenVrmFilePicker} />
                                    <DialogVrmDropStatusCard uiState={dialogVrmUiState} />
                                </DialogSettingsCategory>
                            </>
                        ),
                    },
                    {
                        id: "connection",
                        label: settingsPageCopy.connection.label,
                        title: settingsPageCopy.connection.title,
                        content: (
                            <>
                                {hasStartupOptions ? (
                                    <DialogSettingsCategory
                                        title={settingsPageCopy.connection.startupSectionTitle}
                                    >
                                        <DialogStartupSettingsSection
                                            settings={settings}
                                            uiState={settingsUiState}
                                            onApplySettings={applySettings}
                                            startupStatus={startupSettingsStatus}
                                            startupCapabilities={startupSettingsCapabilities}
                                            isRunning={lifecycleState === "running"}
                                            showSectionTitle={false}
                                        />
                                    </DialogSettingsCategory>
                                ) : null}
                                <DialogSettingsCategory
                                    title={settingsPageCopy.connection.statusSectionTitle}
                                >
                                    <div className="configurationDialogReactSettingsPanel__connectionPage">
                                        <div className="configurationDialogReactSettingsPanel__statusPanel">
                                            <div className="configurationDialogReactSettingsPanel__statusValue">
                                                {connectionStatusLabel(connectionState.value)}
                                            </div>
                                            {connectionDetail ? <div className="configurationDialogReactSettingsPanel__statusDetail">
                                                {connectionDetail}
                                            </div> : null}
                                        </div>
                                        {startupOptionHint ? <div className="configurationDialogReactSettingsPanel__hintText">
                                            {startupOptionHint}
                                        </div> : null}
                                    </div>
                                </DialogSettingsCategory>
                            </>
                        ),
                    },
                ]}
                footer={(
                    <div className="configurationDialogReactSettingsPanel__footer">
                        <div className="configurationDialogReactSettingsPanel__footerLead">
                            <a className="configurationDialogReactSettingsPanel__backLink" href="/">
                                トップへ戻る
                            </a>
                        </div>
                        <div className="configurationDialogReactSettingsPanel__primaryAction">
                            <button
                                type="button"
                                className="configurationDialogReactSettingsPanel__startButton"
                                onClick={startApp}
                                disabled={!currentController || dialogUiState.startButtonDisabled}
                            >
                                {startButtonLabel}
                            </button>
                            {startButtonHint ? (
                                <div className="configurationDialogReactSettingsPanel__hintText">
                                    {startButtonHint}
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
            />
        </div>
    );
}
