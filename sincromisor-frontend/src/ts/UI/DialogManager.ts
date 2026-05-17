import { frontendLogger } from "../logging/appLogger";
import { SincroMediaDeviceService } from "../MediaDevices/SincroMediaDeviceService";
import { DialogEventHub } from "./DialogEventHub";
import { DialogNotificationService } from "./DialogNotificationService";
import {
    DialogSettingsPolicy,
    type DialogSettingsUiHints,
    type DialogSettingsUiState,
} from "./DialogSettingsPolicy";
import {
    DialogStateStore,
    type DialogUiStateValue,
    type DialogVrmUiStateValue,
} from "./DialogStateStore";
import { DialogVrmFileService } from "./DialogVrmFileService";
import { DialogVrmWorkflowService } from "./DialogVrmWorkflowService";
import { HeaderTitleDomAdapter } from "./HeaderTitleDomAdapter";

export type { DialogSettingsUiHints, DialogSettingsUiState } from "./DialogSettingsPolicy";
export type DialogVrmUiState = DialogVrmUiStateValue;
export type DialogUiState = DialogUiStateValue;

type BooleanDialogSettingKey =
    | "enableCharacter"
    | "enableTalk"
    | "enableCharacterGaze"
    | "enableSincroPoseTracking"
    | "forceSincroPoseTracking"
    | "enableAutoMute"
    | "enableNoiseSuppression"
    | "enableEchoCancellation"
    | "enableAutoGainControl"
    | "enableVadGate"
    | "enableVenueNoiseMode"
    | "enableInspector"
    | "enableVR";

// 起動前設定 dialog の中心オーケストレータ。
// 状態の正本は DialogStateStore、保存/復元/通知は各 Service に分離している。
// dialog 本体の native API 呼び出しは React 側 platform adapter が担当する。
export class DialogManager {
    private static instance: DialogManager;
    private readonly stateStore = new DialogStateStore();
    private readonly eventHub = new DialogEventHub();
    private readonly headerDom = new HeaderTitleDomAdapter();
    private readonly settingsPolicy = new DialogSettingsPolicy();
    private readonly mediaDeviceService = SincroMediaDeviceService.getInstance();
    private readonly vrmFileService = new DialogVrmFileService();
    private readonly vrmWorkflowService = new DialogVrmWorkflowService(this.vrmFileService);
    private readonly notificationService = new DialogNotificationService();
    private settingsChangeBatchDepth = 0;
    private settingsChangePending = false;
    private isUserMediaAvailable = true;

    static getManager(): DialogManager {
        if (!DialogManager.instance) {
            DialogManager.instance = new DialogManager();
        }
        return DialogManager.instance;
    }

    private constructor() {
        // store 初期化 -> DOMイベント配線 -> ヘッダー同期 -> dialog 表示 -> 前回VRM復元 の順で起動する。
        this.initializeDialogStateDefaults();
        this.bindMediaDeviceState();
        this.updateTitleText();
        this.showDialog();
        this.loadVrmFile()
            .then(() => {
                frontendLogger.info("VRM file loaded.");
            })
            .catch((error) => {
                frontendLogger.error("VRM file load failed.", { error });
            });
    }

    showDialog(): void {
        // native dialog API 呼び出しは React 側 platform adapter が担当し、
        // ここでは state の正本だけを更新する。
        this.setDialogOpen(true);
    }

    closeDialog(): void {
        this.setDialogOpen(false);
    }

    // React dialog から選択された VRM ファイルを正式経路として適用する。
    applySelectedVrmFile(file: File): void {
        this.updateVrmFile(file);
    }

    // dragover 表示は React が担当しつつ、状態の正本は DialogStateStore に残す。
    setVrmDragOver(isDragOver: boolean): void {
        this.updateVrmDragOverState(isDragOver);
    }

    getSelectedVrmUrl(): string {
        return this.stateStore.getSelectedVrmUrl();
    }

    // 以下の getter/setter は React UI / AppController から参照される dialog 設定の public API。
    // bridge DOM を直接読むのではなく stateStore を正本にしている。
    talkMode(): string {
        return this.stateStore.get("talkMode");
    }

    titleText(): string {
        const titleText = this.stateStore.get("titleText");
        return titleText === "" ? "Sincromisor" : titleText;
    }

    audioInputDeviceId(): string | undefined {
        return this.stateStore.get("audioInputDeviceId");
    }

    videoInputDeviceId(): string | undefined {
        return this.stateStore.get("videoInputDeviceId");
    }

    setTalkMode(value: string): void {
        this.stateStore.set("talkMode", value);
        this.emitSettingsChanged();
    }

    setTitleText(value: string): void {
        this.stateStore.set("titleText", value === "" ? "Sincromisor" : value);
        this.updateTitleText();
        this.emitSettingsChanged();
    }

    setAudioInputDeviceId(deviceId: string | undefined): void {
        this.stateStore.set("audioInputDeviceId", deviceId);
        this.refreshMediaDeviceDerivedUiState();
        this.emitSettingsChanged();
    }

    setVideoInputDeviceId(deviceId: string | undefined): void {
        this.stateStore.set("videoInputDeviceId", deviceId);
        this.refreshMediaDeviceDerivedUiState();
        this.emitSettingsChanged();
    }

    setEnableAutoGainControl(enabled: boolean): void {
        this.setCheckboxValue("enableAutoGainControl", enabled);
    }

    setEnableNoiseSuppression(enabled: boolean): void {
        this.setCheckboxValue("enableNoiseSuppression", enabled);
    }

    setEnableEchoCancellation(enabled: boolean): void {
        this.setCheckboxValue("enableEchoCancellation", enabled);
    }

    setEnableVadGate(enabled: boolean): void {
        this.setCheckboxValue("enableVadGate", enabled);
    }

    setEnableVenueNoiseMode(enabled: boolean): void {
        this.setCheckboxValue("enableVenueNoiseMode", enabled);
    }

    setEnableCharacter(enabled: boolean): void {
        this.setCheckboxValue("enableCharacter", enabled);
    }

    setEnableCharacterGaze(enabled: boolean): void {
        this.setCheckboxValue("enableCharacterGaze", enabled);
    }

    setEnableSincroPoseTracking(enabled: boolean): void {
        this.setCheckboxValue("enableSincroPoseTracking", enabled);
    }

    setForceSincroPoseTracking(enabled: boolean): void {
        this.setCheckboxValue("forceSincroPoseTracking", enabled);
    }

    setEnableAutoMute(enabled: boolean): void {
        this.setCheckboxValue("enableAutoMute", enabled);
    }

    setEnableTalk(enabled: boolean): void {
        this.setCheckboxValue("enableTalk", enabled);
    }

    setEnableInspector(enabled: boolean): void {
        this.setCheckboxValue("enableInspector", enabled);
    }

    setEnableVR(enabled: boolean): void {
        this.setCheckboxValue("enableVR", enabled);
    }

    setCharacterMotionScale(value: number): void {
        this.setNumericValue("characterMotionScale", value);
    }

    setSincroPoseRetargetScale(value: number): void {
        this.setNumericValue("sincroPoseRetargetScale", value);
    }

    setCharacterEyeTrackingScale(value: number): void {
        this.setNumericValue("characterEyeTrackingScale", value);
    }

    subscribeSettingsChange(listener: () => void): () => void {
        return this.eventHub.subscribeSettingsChange(listener);
    }

    subscribeVrmUiState(listener: (state: DialogVrmUiState) => void): () => void {
        return this.eventHub.subscribeVrmUiState(listener, this.stateStore.getDialogVrmUiState());
    }

    subscribeDialogUiState(listener: (state: DialogUiState) => void): () => void {
        return this.eventHub.subscribeDialogUiState(listener, this.stateStore.getDialogUiState());
    }

    getDialogUiState(): DialogUiState {
        return this.stateStore.getDialogUiState();
    }

    getVrmUiState(): DialogVrmUiState {
        return this.stateStore.getDialogVrmUiState();
    }

    settingsUiState(): DialogSettingsUiState {
        return this.settingsPolicy.buildUiState(this.stateStore);
    }

    settingsUiHints(): DialogSettingsUiHints {
        return this.settingsPolicy.buildUiHints(this.stateStore, this.buildMediaDeviceUiContext());
    }

    enableCharacter(): boolean {
        return this.stateStore.get("enableCharacter");
    }

    enableTalk(): boolean {
        return this.stateStore.get("enableTalk");
    }

    enableCharacterGaze(): boolean {
        return this.stateStore.get("enableCharacterGaze");
    }

    enableSincroPoseTracking(): boolean {
        return this.stateStore.get("enableSincroPoseTracking");
    }

    forceSincroPoseTracking(): boolean {
        return this.stateStore.get("forceSincroPoseTracking");
    }

    enableAutoMute(): boolean {
        return this.stateStore.get("enableAutoMute");
    }

    enableAutoGainControl(): boolean {
        // 騒音環境での過増幅回避のため、初期値はOFFだがユーザー選択を優先する。
        return this.stateStore.get("enableAutoGainControl");
    }

    enableNoiseSuppression(): boolean {
        return this.stateStore.get("enableNoiseSuppression");
    }

    enableEchoCancellation(): boolean {
        return this.stateStore.get("enableEchoCancellation");
    }

    enableVadGate(): boolean {
        return this.stateStore.get("enableVadGate");
    }

    enableVenueNoiseMode(): boolean {
        return this.stateStore.get("enableVenueNoiseMode");
    }

    enableInspector(): boolean {
        return this.stateStore.get("enableInspector");
    }

    enableVR(): boolean {
        return this.stateStore.get("enableVR");
    }

    characterMotionScale(): number {
        return this.stateStore.get("characterMotionScale");
    }

    sincroPoseRetargetScale(): number {
        return this.stateStore.get("sincroPoseRetargetScale");
    }

    characterEyeTrackingScale(): number {
        return this.stateStore.get("characterEyeTrackingScale");
    }

    private setCheckboxValue(id: string, enabled: boolean): void {
        const key = this.mapBooleanSettingId(id);
        if (!key) {
            return;
        }
        // disabled 状態の設定は UIから操作できても state を変えない。
        if (this.stateStore.isDisabled(key)) {
            return;
        }
        this.stateStore.set(key, !!enabled);
        if (key === "enableCharacterGaze") {
            this.refreshMediaDeviceDerivedUiState();
        }
        this.emitSettingsChanged();
    }

    private setNumericValue(
        key: "characterMotionScale" | "sincroPoseRetargetScale" | "characterEyeTrackingScale",
        value: number,
    ): void {
        this.stateStore.set(key, value);
        this.emitSettingsChanged();
    }

    private emitSettingsChanged(): void {
        if (this.settingsChangeBatchDepth > 0) {
            // 状態更新の途中では即時 emit せず、batch 終了時に 1 回だけ通知する。
            this.settingsChangePending = true;
            return;
        }
        this.eventHub.emitSettingsChanged();
    }

    private runSettingsChangeBatch(action: () => void): void {
        // Character/Gaze/AutoMute の連動更新で settingsChange が連打されないようにする。
        this.settingsChangeBatchDepth += 1;
        try {
            action();
        } finally {
            this.settingsChangeBatchDepth -= 1;
            if (this.settingsChangeBatchDepth === 0 && this.settingsChangePending) {
                this.settingsChangePending = false;
                this.eventHub.emitSettingsChanged();
            }
        }
    }

    private getTitleText(): string {
        return this.titleText();
    }

    updateTitleText(): void {
        this.headerDom.setHeaderTitle(this.getTitleText());
    }

    updateCharacterStatus(available: boolean): void {
        this.runSettingsChangeBatch(() => {
            this.updateEnableCharacterStatus(available);
            this.updateEnableCharacterGazeStatus(available);
            this.updateAutoMuteStatus();
            // disabled/checked 状態の変化も React 側へ同期する。
            this.emitSettingsChanged();
        });
    }

    updateUserMediaAvailabilityStatus(available: boolean): void {
        this.isUserMediaAvailable = available;
        this.runSettingsChangeBatch(() => {
            if (!available) {
                this.updateEnableCharacterGazeStatus(false);
                this.updateAutoMuteStatus();
            }
            this.refreshMediaDeviceDerivedUiState();
            // getUserMedia 可否に連動した設定項目の disabled 変化を通知する。
            this.emitSettingsChanged();
        });
    }

    private updateEnableCharacterStatus(available: boolean) {
        this.settingsPolicy.applyCharacterAvailability(this.stateStore, available);
    }

    updateEnableCharacterGazeStatus(available: boolean): void {
        this.settingsPolicy.applyCharacterGazeAvailability(this.stateStore, available);
        this.refreshMediaDeviceDerivedUiState();
        this.emitSettingsChanged();
    }

    updateAutoMuteStatus(): void {
        this.settingsPolicy.applyAutoMuteAvailability(this.stateStore);
        this.emitSettingsChanged();
    }

    private initializeDialogStateDefaults(): void {
        this.settingsPolicy.initializeDefaultDisabledState(this.stateStore);
        this.refreshMediaDeviceDerivedUiState();
    }

    private bindMediaDeviceState(): void {
        this.mediaDeviceService.start();
        this.mediaDeviceService.subscribe(() => {
            this.refreshMediaDeviceDerivedUiState();
            this.emitSettingsChanged();
        });
        void this.mediaDeviceService.refresh();
    }

    private buildMediaDeviceUiContext() {
        return {
            isUserMediaAvailable: this.isUserMediaAvailable,
            audioInputSelection: this.mediaDeviceService.getSelectionState(
                "audioinput",
                this.stateStore.get("audioInputDeviceId"),
            ),
            videoInputSelection: this.mediaDeviceService.getSelectionState(
                "videoinput",
                this.stateStore.get("videoInputDeviceId"),
            ),
        };
    }

    private refreshMediaDeviceDerivedUiState(): void {
        const context = this.buildMediaDeviceUiContext();
        const startButtonState = this.settingsPolicy.buildStartButtonState(
            this.stateStore,
            context,
        );
        this.setDialogStartButtonState(
            startButtonState.startButtonDisabled,
            startButtonState.startButtonText,
            startButtonState.startButtonHint,
        );
    }

    private mapBooleanSettingId(id: string): BooleanDialogSettingKey | undefined {
        const mapping: Record<string, BooleanDialogSettingKey | undefined> = {
            enableCharacter: "enableCharacter",
            enableTalk: "enableTalk",
            enableCharacterGaze: "enableCharacterGaze",
            enableSincroPoseTracking: "enableSincroPoseTracking",
            forceSincroPoseTracking: "forceSincroPoseTracking",
            enableAutoMute: "enableAutoMute",
            enableNoiseSuppression: "enableNoiseSuppression",
            enableEchoCancellation: "enableEchoCancellation",
            enableAutoGainControl: "enableAutoGainControl",
            enableVadGate: "enableVadGate",
            enableVenueNoiseMode: "enableVenueNoiseMode",
            enableInspector: "enableInspector",
            enableVR: "enableVR",
        };
        return mapping[id];
    }

    private updateVrmFile(file: File): void {
        this.vrmWorkflowService
            .applySelectedVrmFile(file)
            .then((result) => {
                if (!result.ok) {
                    this.setVrmStatusText(result.statusText);
                    this.notificationService.writeError(result.popError);
                    return;
                }
                this.stateStore.setSelectedVrmUrl(result.vrmUrl);
                this.setVrmStatusText(result.statusText);
                this.notificationService.writeInfo(result.popMessage);
                frontendLogger.info("VRM file updated.", {
                    size: file.size,
                    type: file.type,
                });
            })
            .catch((error) => {
                this.setVrmStatusText("VRMファイルの更新に失敗しました");
                this.notificationService.writeError("VRMファイルの更新に失敗しました。");
                frontendLogger.error("VRM file update failed.", { error });
            });
    }

    private async loadVrmFile(): Promise<void> {
        const result = await this.vrmWorkflowService.loadInitialVrmSelection();
        if (result.vrmUrl) {
            this.stateStore.setSelectedVrmUrl(result.vrmUrl);
        }
        this.setVrmStatusText(result.statusText);
    }

    // 変換済みサムネイル画像(Blob)を保存する。
    async saveVrmThumbnailBlob(blob: Blob): Promise<void> {
        await this.vrmFileService.saveVrmThumbnailBlob(blob);
    }

    // 起動時に前回使用したサムネイルを復元する。
    async loadVrmThumbnailBlob(): Promise<Blob | null> {
        return this.vrmFileService.loadVrmThumbnailBlob();
    }

    // モデル更新時にキャッシュ不整合を防ぐための明示削除。
    async clearVrmThumbnailCache(): Promise<void> {
        await this.vrmFileService.clearVrmThumbnailCache();
    }

    private updateVrmDragOverState(isDragOver: boolean): void {
        const current = this.stateStore.getDialogVrmUiState();
        if (current.isDragOver === isDragOver) {
            return;
        }
        this.stateStore.setDialogVrmDragOver(isDragOver);
        // dragover は React UI 側で描画するため、state 更新後に購読イベントだけを流す。
        this.emitVrmUiStateChanged();
    }

    private setVrmStatusText(vrmStatusText: string): void {
        const current = this.stateStore.getDialogVrmUiState();
        if (current.vrmStatusText === vrmStatusText) {
            return;
        }
        this.stateStore.setDialogVrmStatusText(vrmStatusText);
        // VRM status は Pop通知文言と合わせて短時間に更新されることがあるため、同値ガード後に単発通知する。
        this.emitVrmUiStateChanged();
    }

    private emitVrmUiStateChanged(): void {
        this.eventHub.emitCurrentVrmUiState(() => this.stateStore.getDialogVrmUiState());
    }

    private setDialogOpen(isOpen: boolean): void {
        const current = this.stateStore.getDialogUiState();
        if (current.isOpen === isOpen) {
            return;
        }
        this.stateStore.setDialogOpen(isOpen);
        this.emitDialogUiStateChanged();
    }

    private setDialogStartButtonState(
        startButtonDisabled: boolean,
        startButtonText: string,
        startButtonHint?: string,
    ): void {
        const current = this.stateStore.getDialogUiState();
        if (
            current.startButtonDisabled === startButtonDisabled &&
            current.startButtonText === startButtonText &&
            current.startButtonHint === startButtonHint
        ) {
            return;
        }
        this.stateStore.setDialogStartButtonState(
            startButtonDisabled,
            startButtonText,
            startButtonHint,
        );
        // start button 状態は settingsChange と別イベントで通知し、React 側で dialog 表示状態の更新順を安定させる。
        this.emitDialogUiStateChanged();
    }

    private emitDialogUiStateChanged(): void {
        this.eventHub.emitCurrentDialogUiState(() => this.stateStore.getDialogUiState());
    }
}
