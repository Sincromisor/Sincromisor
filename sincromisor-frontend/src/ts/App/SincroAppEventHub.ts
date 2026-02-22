import type { SincroAppEvent } from "./SincroAppTypes";

// SincroAppController の instance listener 管理を分離する軽量 event hub。
// static な active controller 購読とは別に、AppEvent 配信だけを担当する。
export class SincroAppEventHub {
    private readonly listeners = new Set<(event: SincroAppEvent) => void>();

    subscribe(listener: (event: SincroAppEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    emit(event: SincroAppEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
