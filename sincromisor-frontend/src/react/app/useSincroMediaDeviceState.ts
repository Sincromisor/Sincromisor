import { useEffect, useState } from "react";
import {
    buildSincroMediaDeviceSelections,
    type SincroMediaDeviceSelectionState,
    SincroMediaDeviceService,
    type SincroMediaDeviceSnapshot,
} from "../../ts/mediaDevices/sincroMediaDeviceService";

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

// React UI 向けに media device service を hook 化する。
// enumerate と devicechange は service 側、選択済みIDの有効性導出は hook 側で扱う。
export function useSincroMediaDeviceState(
    params: UseSincroMediaDeviceStateParams = {},
): UseSincroMediaDeviceStateResult {
    const service = SincroMediaDeviceService.getInstance();
    const [snapshot, setSnapshot] = useState<SincroMediaDeviceSnapshot>(() =>
        service.getSnapshot(),
    );

    useEffect(() => {
        service.start();
        const unsubscribe = service.subscribe((nextSnapshot) => {
            setSnapshot(nextSnapshot);
        });
        void service.refresh();
        return () => {
            unsubscribe();
        };
    }, [service]);

    const selections = buildSincroMediaDeviceSelections({
        snapshot,
        audioInputDeviceId: params.audioInputDeviceId,
        videoInputDeviceId: params.videoInputDeviceId,
    });

    return {
        snapshot,
        audioInputSelection: selections.audioInput,
        videoInputSelection: selections.videoInput,
        refreshDevices: () => service.refresh(),
    };
}
