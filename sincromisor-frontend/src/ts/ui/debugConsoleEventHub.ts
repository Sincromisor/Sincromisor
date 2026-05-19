import type { DebugConsoleManagerEvent } from "./debugConsolePublicTypes";

// DebugConsoleManager の購読管理だけを受け持つ軽量 hub。
// snapshot 更新とイベント通知の責務を分け、manager 本体は state 更新 API に集中させる。
export class DebugConsoleEventHub {
    private readonly eventListeners = new Set<(event: DebugConsoleManagerEvent) => void>();
    private readonly snapshotListeners = new Set<() => void>();

    subscribeEvent(listener: (event: DebugConsoleManagerEvent) => void): () => void {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }

    subscribeSnapshot(listener: () => void): () => void {
        this.snapshotListeners.add(listener);
        return () => {
            this.snapshotListeners.delete(listener);
        };
    }

    emitEvent(event: DebugConsoleManagerEvent): void {
        for (const listener of this.eventListeners) {
            listener(event);
        }
    }

    emitSnapshotChanged(): void {
        for (const listener of this.snapshotListeners) {
            listener();
        }
    }
}
