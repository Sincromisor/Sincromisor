import { SincroMediaDeviceService } from "../../media/devices/sincroMediaDeviceService";
import type { DialogSettingsPolicy } from "./dialogSettingsPolicy";
import type { DialogStateStore } from "./dialogStateStore";

// Dialog 設定 UI に必要な media device 選択状態を集約する controller。
// getUserMedia 可否、device refresh、開始ボタンの派生状態を DialogManager から分離する。
export class DialogMediaDeviceUiController {
    private readonly mediaDeviceService = SincroMediaDeviceService.getInstance();
    private isUserMediaAvailable = true;

    constructor(
        private readonly stateStore: DialogStateStore,
        private readonly settingsPolicy: DialogSettingsPolicy,
        private readonly emitSettingsChanged: () => void,
        private readonly setStartButtonState: (
            startButtonDisabled: boolean,
            startButtonText: string,
            startButtonHint?: string,
        ) => void,
    ) {}

    start(): void {
        this.mediaDeviceService.start();
        this.mediaDeviceService.subscribe(() => {
            this.refreshDerivedUiState();
            this.emitSettingsChanged();
        });
        void this.mediaDeviceService.refresh();
    }

    setUserMediaAvailability(available: boolean): void {
        this.isUserMediaAvailable = available;
    }

    /** 現在の機器IDを機器一覧と照合し、開始可否と案内文の判定材料を返す。 */
    buildUiContext() {
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

    /** 設定反映後の機器選択と視線設定から開始ボタンの状態を再計算する。 */
    refreshDerivedUiState(): void {
        const startButtonState = this.settingsPolicy.buildStartButtonState(
            this.stateStore,
            this.buildUiContext(),
        );
        this.setStartButtonState(
            startButtonState.startButtonDisabled,
            startButtonState.startButtonText,
            startButtonState.startButtonHint,
        );
    }
}
