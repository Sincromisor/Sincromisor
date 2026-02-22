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
        listener(this.current);
        return () => {
            this.listeners.delete(listener);
        };
    }

    setCurrent(controller: SincroAppController | null): void {
        this.current = controller;
        for (const listener of this.listeners) {
            listener(controller);
        }
    }
}
