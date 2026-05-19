import type { SincroAppEvent } from "../../app/controller/sincroAppTypes";

// SincroAppController の instance listener 管理を分離する軽量 event hub。
// static な active controller 購読とは別に、AppEvent 配信だけを担当する。
export class SincroAppEventHub {
    private readonly listeners = new Set<(event: SincroAppEvent) => void>();

    subscribe(listener: (event: SincroAppEvent) => void): () => void {
        // Controller.subscribe() の戻り値としてそのまま使える unsubscribe を返す。
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    emit(event: SincroAppEvent): void {
        // 登録順のまま配信し、UI 側の状態更新順序の予測可能性を保つ。
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
