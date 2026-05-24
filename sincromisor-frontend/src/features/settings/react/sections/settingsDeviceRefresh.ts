import { useState } from "react";
import type { SincroMediaDeviceSnapshot } from "../../../media/devices/sincroMediaDeviceService";

export function useSettingsDeviceRefresh(
    onRefreshDevices: () => Promise<SincroMediaDeviceSnapshot>,
): {
    refreshMessage: string;
    handleRefreshDevices: () => void;
} {
    const [refreshMessage, setRefreshMessage] = useState<string>("");
    return {
        refreshMessage,
        handleRefreshDevices: () => {
            setRefreshMessage("");
            void onRefreshDevices().then((nextSnapshot) => {
                setRefreshMessage(createDeviceRefreshMessage(nextSnapshot));
            });
        },
    };
}

export function createDeviceRefreshMessage(snapshot: SincroMediaDeviceSnapshot): string {
    if (snapshot.refreshError) {
        return `デバイス一覧の再取得に失敗しました: ${snapshot.refreshError}`;
    }
    return "デバイス一覧を更新しました。";
}
