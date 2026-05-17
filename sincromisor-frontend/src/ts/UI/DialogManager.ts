import { frontendLogger } from "../logging/appLogger";
import { DialogEventHub } from "./DialogEventHub";
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
import { mapBooleanDialogSettingId } from "./dialogBooleanSettings";
import { DialogMediaDeviceUiController } from "./dialogMediaDeviceUiController";
import { DialogSettingsChangeBatcher } from "./dialogSettingsChangeBatcher";
import { DialogUiStateController } from "./dialogUiStateController";
import { DialogVrmStateController } from "./dialogVrmStateController";
import { HeaderTitleDomAdapter } from "./HeaderTitleDomAdapter";

export type { DialogSettingsUiHints, DialogSettingsUiState } from "./DialogSettingsPolicy";
export type DialogVrmUiState = DialogVrmUiStateValue;
export type DialogUiState = DialogUiStateValue;

// 起動前設定 dialog の中心オーケストレータ。
// 状態の正本は DialogStateStore、保存/復元/通知は各 Service に分離している。
// dialog 本体の native API 呼び出しは React 側 platform adapter が担当する。
export class DialogManager {
    private static instance: DialogManager;
    private readonly stateStore = new DialogStateStore();
    private readonly eventHub = new DialogEventHub();
    private readonly headerDom = new HeaderTitleDomAdapter();
    private readonly settingsPolicy = new DialogSettingsPolicy();
    private readonly settingsChangeBatcher = new DialogSettingsChangeBatcher(() => {
        this.eventHub.emitSettingsChanged();
    });
    private readonly dialogUiStateController = new DialogUiStateController(
        this.stateStore,
        this.eventHub,
    );
    private readonly mediaDeviceUiController = new DialogMediaDeviceUiController(
        this.stateStore,
        this.settingsPolicy,
        () => this.settingsChangeBatcher.emit(),
        (startButtonDisabled, startButtonText, startButtonHint) => {
            this.dialogUiStateController.setStartButtonState(
                startButtonDisabled,
                startButtonText,
                startButtonHint,
            );
        },
    );
    private readonly vrmStateController = new DialogVrmStateController(
        this.stateStore,
        this.eventHub,
    );

    static getManager(): DialogManager {
        if (!DialogManager.instance) {
            DialogManager.instance = new DialogManager();
        }
        return DialogManager.instance;
    }

    private constructor() {
        // store 初期化 -> DOMイベント配線 -> ヘッダー同期 -> dialog 表示 -> 前回VRM復元 の順で起動する。
        this.initializeDialogStateDefaults();
        this.mediaDeviceUiController.start();
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
        this.dialogUiStateController.setOpen(true);
    }

    closeDialog(): void {
        this.dialogUiStateController.setOpen(false);
    }

    // React dialog から選択された VRM ファイルを正式経路として適用する。
    applySelectedVrmFile(file: File): void {
        this.vrmStateController.applySelectedVrmFile(file);
    }

    // dragover 表示は React が担当しつつ、状態の正本は DialogStateStore に残す。
    setVrmDragOver(isDragOver: boolean): void {
        this.vrmStateController.setDragOver(isDragOver);
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
        this.settingsChangeBatcher.emit();
    }

    setTitleText(value: string): void {
        this.stateStore.set("titleText", value === "" ? "Sincromisor" : value);
        this.updateTitleText();
        this.settingsChangeBatcher.emit();
    }

    setAudioInputDeviceId(deviceId: string | undefined): void {
        this.stateStore.set("audioInputDeviceId", deviceId);
        this.mediaDeviceUiController.refreshDerivedUiState();
        this.settingsChangeBatcher.emit();
    }

    setVideoInputDeviceId(deviceId: string | undefined): void {
        this.stateStore.set("videoInputDeviceId", deviceId);
        this.mediaDeviceUiController.refreshDerivedUiState();
        this.settingsChangeBatcher.emit();
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
        return this.settingsPolicy.buildUiHints(
            this.stateStore,
            this.mediaDeviceUiController.buildUiContext(),
        );
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
        const key = mapBooleanDialogSettingId(id);
        if (!key) {
            return;
        }
        // disabled 状態の設定は UIから操作できても state を変えない。
        if (this.stateStore.isDisabled(key)) {
            return;
        }
        this.stateStore.set(key, !!enabled);
        if (key === "enableCharacterGaze") {
            this.mediaDeviceUiController.refreshDerivedUiState();
        }
        this.settingsChangeBatcher.emit();
    }

    private setNumericValue(
        key: "characterMotionScale" | "sincroPoseRetargetScale" | "characterEyeTrackingScale",
        value: number,
    ): void {
        this.stateStore.set(key, value);
        this.settingsChangeBatcher.emit();
    }

    private getTitleText(): string {
        return this.titleText();
    }

    updateTitleText(): void {
        this.headerDom.setHeaderTitle(this.getTitleText());
    }

    updateCharacterStatus(available: boolean): void {
        this.settingsChangeBatcher.run(() => {
            this.updateEnableCharacterStatus(available);
            this.updateEnableCharacterGazeStatus(available);
            this.updateAutoMuteStatus();
            // disabled/checked 状態の変化も React 側へ同期する。
            this.settingsChangeBatcher.emit();
        });
    }

    updateUserMediaAvailabilityStatus(available: boolean): void {
        this.mediaDeviceUiController.setUserMediaAvailability(available);
        this.settingsChangeBatcher.run(() => {
            if (!available) {
                this.updateEnableCharacterGazeStatus(false);
                this.updateAutoMuteStatus();
            }
            this.mediaDeviceUiController.refreshDerivedUiState();
            // getUserMedia 可否に連動した設定項目の disabled 変化を通知する。
            this.settingsChangeBatcher.emit();
        });
    }

    private updateEnableCharacterStatus(available: boolean) {
        this.settingsPolicy.applyCharacterAvailability(this.stateStore, available);
    }

    updateEnableCharacterGazeStatus(available: boolean): void {
        this.settingsPolicy.applyCharacterGazeAvailability(this.stateStore, available);
        this.mediaDeviceUiController.refreshDerivedUiState();
        this.settingsChangeBatcher.emit();
    }

    updateAutoMuteStatus(): void {
        this.settingsPolicy.applyAutoMuteAvailability(this.stateStore);
        this.settingsChangeBatcher.emit();
    }

    private initializeDialogStateDefaults(): void {
        this.settingsPolicy.initializeDefaultDisabledState(this.stateStore);
        this.mediaDeviceUiController.refreshDerivedUiState();
    }

    private async loadVrmFile(): Promise<void> {
        await this.vrmStateController.loadInitialVrmSelection();
    }

    // 変換済みサムネイル画像(Blob)を保存する。
    async saveVrmThumbnailBlob(blob: Blob): Promise<void> {
        await this.vrmStateController.saveThumbnailBlob(blob);
    }

    // 起動時に前回使用したサムネイルを復元する。
    async loadVrmThumbnailBlob(): Promise<Blob | undefined> {
        return this.vrmStateController.loadThumbnailBlob();
    }

    // モデル更新時にキャッシュ不整合を防ぐための明示削除。
    async clearVrmThumbnailCache(): Promise<void> {
        await this.vrmStateController.clearThumbnailCache();
    }
}
