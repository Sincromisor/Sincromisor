/** スクロール領域の上端から測った、発話の位置。本文の高さ変更や保持上限での削除を比較する。 */
export type HistoryMessagePosition = { id: string; top: number; bottom: number };

/** 表示内に残る最初の発話を同じ位置へ保つ差分。削除された発話は次の保持中発話へ進める。 */
export function historyScrollAdjustment(
    previous: readonly HistoryMessagePosition[],
    current: readonly HistoryMessagePosition[],
): number {
    for (const anchor of previous) {
        if (anchor.bottom <= 0) continue;
        const next = current.find((item) => item.id === anchor.id);
        if (next) return next.top - anchor.top;
    }
    return 0;
}

/** ブラウザーの端数丸めを2pxだけ許し、利用者が過去へ移動したら追従を止める。 */
export function historyIsAtLatest({
    scrollTop,
    scrollHeight,
    clientHeight,
}: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}): boolean {
    return scrollHeight - clientHeight - scrollTop <= 2;
}
