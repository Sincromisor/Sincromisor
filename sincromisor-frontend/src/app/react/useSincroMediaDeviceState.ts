import { useEffect, useSyncExternalStore } from "react";
import {
    buildSincroMediaDeviceSelections,
    type SincroMediaDeviceSelectionState,
    SincroMediaDeviceService,
    type SincroMediaDeviceSnapshot,
} from "../../features/media/devices/sincroMediaDeviceService";

type UseSincroMediaDeviceStateParams = {
    audioInputDeviceId?: string | undefined;
    videoInputDeviceId?: string | undefined;
};

type UseSincroMediaDeviceStateResult = {
    snapshot: SincroMediaDeviceSnapshot;
    audioInputSelection: SincroMediaDeviceSelectionState;
    videoInputSelection: SincroMediaDeviceSelectionState;
    refreshDevices: () => Promise<SincroMediaDeviceSnapshot>;
};

// 取得・購読関数を固定し、再描画による再登録を避ける。
const service = SincroMediaDeviceService.getInstance();
const getSnapshot = () => service.getSnapshot();
const subscribe = (listener: () => void) => service.subscribe(listener);
const refreshDevices = () => service.refresh();

/** 共有機器サービスを直接購読し、選択済みIDの有効性だけを導出する。 */
export function useSincroMediaDeviceState(
    params: UseSincroMediaDeviceStateParams = {},
): UseSincroMediaDeviceStateResult {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        service.start();
        void service.refresh();
        // 監視は共有サービスが所有するため、画面の取り外しでは停止しない。
    }, []);

    const selections = buildSincroMediaDeviceSelections({
        snapshot,
        audioInputDeviceId: params.audioInputDeviceId,
        videoInputDeviceId: params.videoInputDeviceId,
    });

    return {
        snapshot,
        audioInputSelection: selections.audioInput,
        videoInputSelection: selections.videoInput,
        refreshDevices,
    };
}
