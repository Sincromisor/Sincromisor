import type { SincroAppController } from "./sincroAppController";

/** 有効なアプリ制御を保持し、差し替え時は旧外部購読を解除してReactへ通知する。 */
export class SincroAppActiveControllerRegistry {
    private current: SincroAppController | undefined;
    private readonly listeners = new Set<(controller: SincroAppController | undefined) => void>();

    /** 現在公開している制御処理を返す。 */
    getCurrent(): SincroAppController | undefined {
        return this.current;
    }

    /** 現在値と以後の差し替えを通知する。戻り値でこの通知の購読を解除する。 */
    subscribe(listener: (controller: SincroAppController | undefined) => void): () => void {
        this.listeners.add(listener);
        // 現在値を即時通知して、Reactが取り付け直後に有効な制御処理を把握できるようにする。
        listener(this.current);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** 旧制御の外部購読を解除してから新制御を公開する。同一インスタンスの再指定では解除しない。 */
    setCurrent(controller: SincroAppController | undefined): void {
        if (this.current !== controller) {
            this.current?.releaseEventSubscriptions();
        }
        this.current = controller;
        // 制御処理の差し替えと登録解除のどちらも通知し、Reactの購読先を切り替える。
        for (const listener of this.listeners) {
            listener(controller);
        }
    }
}
