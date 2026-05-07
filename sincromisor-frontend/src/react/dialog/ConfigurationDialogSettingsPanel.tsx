import type { ChangeEvent, DragEvent } from "react";
import { useRef } from "react";
import { SettingsShell } from "../settings-shell/SettingsShell";
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
    const startButtonHint = dialogUiState.startButtonHint ?? "必要な設定を確認したら、このまま開始できます。";

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
                        label: "会話",
                        title: "会話",
                        content: (
                            <DialogSettingsCategory
                                title="会話"
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
                        label: "デバイス",
                        title: "マイクとカメラ",
                        content: (
                            <DialogSettingsCategory
                                title="デバイス"
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
                        label: "音声",
                        title: "音声",
                        content: (
                            <DialogSettingsCategory
                                title="マイク補正"
                                description="ノイズや反響に合わせて声の拾い方を調整します。"
                            >
                                <DialogMicSettingsSection
                                    settings={settings}
                                    uiState={settingsUiState}
                                    onApplySettings={applySettings}
                                    showSectionTitle={false}
                                />
                            </DialogSettingsCategory>
                        ),
                    },
                    {
                        id: "display",
                        label: "表示",
                        title: "キャラクター表示とVRMモデル",
                        content: (
                            <>
                                <DialogSettingsCategory
                                    title="キャラクター表示"
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
                                    title="VRM モデル"
                                >
                                    <VrmModelSection onOpenFilePicker={handleOpenVrmFilePicker} />
                                    <DialogVrmDropStatusCard uiState={dialogVrmUiState} />
                                </DialogSettingsCategory>
                            </>
                        ),
                    },
                    {
                        id: "connection",
                        label: "接続",
                        title: "接続",
                        description: "接続状態",
                        content: (
                            <>
                                {hasStartupOptions ? (
                                    <DialogSettingsCategory
                                        title="開始時の設定"
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
                                    title="接続状態"
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
                            <div className="configurationDialogReactSettingsPanel__hintText">
                                {startButtonHint}
                            </div>
                        </div>
                    </div>
                )}
            />
        </div>
    );
}
