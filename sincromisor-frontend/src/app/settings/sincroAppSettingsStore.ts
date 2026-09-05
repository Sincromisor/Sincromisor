import type { SincroAppSettingsRelatedSnapshotPayload } from "./sincroAppSettingsRelatedSnapshotBuilder";

/** 設定値・操作可否・案内を同じ更新時点で参照するための組。 */
export type SincroAppSettingsStateSnapshot = Omit<
    SincroAppSettingsRelatedSnapshotPayload,
    "startupSettingsStatus"
>;

/** Reactが正本の変更を購読する。取得だけでは参照を変えず、更新後に一度通知する。 */
export class SincroAppSettingsStore {
    private snapshot: SincroAppSettingsStateSnapshot;
    private readonly listeners = new Set<() => void>();

    /** アプリ制御の公開前に、ダイアログと実行時設定から初期値を確定する。 */
    constructor(snapshot: SincroAppSettingsStateSnapshot) {
        this.snapshot = snapshot;
    }

    /** 変更がない間は同じ参照を返す。呼び出し側は内容を書き換えない。 */
    getSnapshot = (): SincroAppSettingsStateSnapshot => this.snapshot;

    /** 更新通知だけを購読する。初期値はgetSnapshotで取得し、取り外し時は戻り値で解除する。 */
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /** 設定の一括適用が完了してから呼ぶ。同じ内容の再通知では参照と購読者を維持する。 */
    update(snapshot: SincroAppSettingsStateSnapshot): void {
        // 設定は数値・文字列・真偽値と未指定値だけのため、内容比較で同値更新を抑止できる。
        if (JSON.stringify(this.snapshot) === JSON.stringify(snapshot)) return;
        this.snapshot = snapshot;
        for (const listener of this.listeners) listener();
    }
}
