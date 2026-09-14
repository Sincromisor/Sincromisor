import { SincroMediaDeviceService } from "../../features/media/devices/sincroMediaDeviceService";
import type { SincroAppSettingsValues } from "./sincroAppSettingsValues";

/** 機器一覧と通常設定の選択IDを照合する。購読の開始・解除は有効アプリが所有する。 */
export class SincroAppSettingsMediaDevices {
    private readonly mediaDeviceService = SincroMediaDeviceService.getInstance();
    private isUserMediaAvailable = true;

    constructor(private readonly stateStore: SincroAppSettingsValues) {}

    /** 機器通知だけを接続する。共有機器サービス自体は解除時に停止しない。 */
    start(emitSettingsChanged: () => void): () => void {
        this.mediaDeviceService.start();
        const unsubscribe = this.mediaDeviceService.subscribe(emitSettingsChanged);
        void this.mediaDeviceService.refresh();
        return unsubscribe;
    }

    /** ブラウザーの取得APIの可否を次の開始条件へ反映する。 */
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
}
