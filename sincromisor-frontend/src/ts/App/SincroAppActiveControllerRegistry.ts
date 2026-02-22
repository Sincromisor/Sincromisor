import type { SincroAppController } from "./SincroAppController";

// MPA ページごとの active AppController を管理する static registry。
// SincroAppController 本体から static state/listener 管理を外し、責務を明確化する。
export class SincroAppActiveControllerRegistry {
    private current: SincroAppController | null = null;
    private readonly listeners = new Set<(controller: SincroAppController | null) => void>();

    getCurrent(): SincroAppController | null {
        return this.current;
    }

    subscribe(listener: (controller: SincroAppController | null) => void): () => void {
        this.listeners.add(listener);
        // 現在値を即時通知して、React 側が mount 直後に active controller を把握できるようにする。
        listener(this.current);
        return () => {
            this.listeners.delete(listener);
        };
    }

    setCurrent(controller: SincroAppController | null): void {
        this.current = controller;
        // MPA ページ切替時の差し替えを想定し、null/新 controller の両方を通知する。
        for (const listener of this.listeners) {
            listener(controller);
        }
    }
}
