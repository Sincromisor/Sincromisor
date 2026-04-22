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

    const hasStartupOptions =
        startupSettingsCapabilities.enableTalk
        || startupSettingsCapabilities.enableInspector
        || startupSettingsCapabilities.enableVR;
    const connectionDetail = connectionState.detail || "左のカテゴリで必要な項目を見直したら、下の開始ボタンから会話画面へ進めます。";
    const startupOptionHint = startupSettingsStatus.changedKeys.length > 0
        ? `開始前だけ効く項目に変更があります: ${startupSettingsStatus.changedKeys.join(", ")}`
        : hasStartupOptions
            ? "開始前だけ効く項目は、必要な時だけこのページで調整します。"
            : "このページでは接続前の最終確認だけを行います。";
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
                badge="初回セットアップ"
                title="会話を始める前のセットアップ"
                description="この画面で会話・入出力デバイス・音声・表示・接続の準備を確認します。完了すると会話画面へ進み、開始後の設定パネルからも同じ分類で見直せます。"
                initialPageId="conversation"
                pages={[
                    {
                        id: "conversation",
                        label: "会話",
                        title: "会話",
                        description: "最初に、会話画面で使う名前と会話モードを確認します。",
                        content: (
                            <DialogSettingsCategory
                                title="会話の基本"
                                description="会話画面に表示する名前と、やり取りの進み方をここで決めます。開始後の設定パネルでも同じ分類で見直せます。"
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
                        label: "入出力デバイス",
                        title: "入出力デバイス",
                        description: "会話に使うマイクと、視線連動に使うカメラを同じ場所で確認します。",
                        content: (
                            <DialogSettingsCategory
                                title="使うデバイス"
                                description="開始前に使うマイクと視線用カメラを確認します。開始後もここで選んだ内容を引き継ぎます。"
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
                        description: "声の入り方や無音時の扱いなど、会話音声の調整だけをまとめています。",
                        content: (
                            <DialogSettingsCategory
                                title="マイク前処理"
                                description="ノイズや反響の多い環境でも話しやすくするための補正です。必要なものだけオンにして試せます。"
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
                        title: "表示",
                        description: "キャラクター表示、視線連動のオンオフ、VRM モデルを開始前に確認します。",
                        content: (
                            <>
                                <DialogSettingsCategory
                                    title="キャラクター表示"
                                    description="3Dキャラクター、顔の向き連動、自動ミュートなど、見た目とふるまいをまとめて調整します。"
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
                                    description="表示するモデルを差し替えたい時の導線です。ファイル選択とドラッグ&ドロップのどちらでも更新できます。"
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
                        description: "最後に接続状態を確認し、下部の開始ボタンから会話画面へ進みます。開始前だけ効く項目がある時だけ、このページで扱います。",
                        content: (
                            <>
                                {hasStartupOptions ? (
                                    <DialogSettingsCategory
                                        title="開始前だけ効く項目"
                                        description="会話を始める瞬間にだけ反映される項目です。必要な時だけここで調整します。"
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
                                    title="開始前の確認"
                                    description="状態を確認したら、このまま下の主ボタンへ進みます。見直したい項目があれば左のカテゴリに戻れます。"
                                >
                                    <div className="configurationDialogReactSettingsPanel__connectionPage">
                                        <div className="configurationDialogReactSettingsPanel__statusPanel">
                                            <div className="configurationDialogReactSettingsPanel__statusLabel">
                                                現在の状態
                                            </div>
                                            <div className="configurationDialogReactSettingsPanel__statusValue">
                                                {connectionStatusLabel(connectionState.value)}
                                            </div>
                                            <div className="configurationDialogReactSettingsPanel__statusDetail">
                                                {connectionDetail}
                                            </div>
                                        </div>
                                        <div className="configurationDialogReactSettingsPanel__hintText">
                                            {startupOptionHint}
                                        </div>
                                        <div className="configurationDialogReactSettingsPanel__hintText">
                                            このセットアップは開始前の必須フローです。途中で離れる場合はトップへ戻れます。
                                        </div>
                                    </div>
                                </DialogSettingsCategory>
                            </>
                        ),
                    },
                ]}
                footer={(
                    <div className="configurationDialogReactSettingsPanel__footer">
                        <div className="configurationDialogReactSettingsPanel__footerLead">
                            <div className="configurationDialogReactSettingsPanel__exitHint">
                                途中で離れる場合はトップへ戻れます。ESC キーや背景クリックでは閉じません。
                            </div>
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
