import { DialogVrmFileService } from "../../features/dialog/model/dialogVrmFileService";
import {
    SincroAppSettingsPersistence,
    sincroSettingsPages,
    sincroSettingsStorageKey,
} from "./sincroAppSettingsPersistence";

/** 設定用URL指定だけを解除し、ページ・無関係なクエリー・ハッシュを保つ。 */
export function buildResetSettingsUrl(href: string): string {
    const url = new URL(href);
    url.searchParams.delete("talkMode");
    return url.href;
}

/**
 * 確認後に同一オリジンの所有データを削除して再読込する。取消は副作用を持たない。
 * 失敗時は保存停止を維持して再実行を許し、削除失敗をUIへ伝える。
 */
export async function resetSincroAppSettings(): Promise<void> {
    if (
        !window.confirm(
            "全ページの設定・デバッグ調整と、保存したVRM・サムネイルを削除します。元のVRMファイルは削除しません。再読み込みにより会話が終了し、全て初期設定に戻ります。実行しますか？",
        )
    )
        return;
    const url = buildResetSettingsUrl(window.location.href);
    SincroAppSettingsPersistence.stopSaving();
    // VRM保存停止は最初のawaitより前に行う。後から完了する選択・画像変換も保存できなくなる。
    await DialogVrmFileService.clearSavedSelection();
    for (const page of sincroSettingsPages) {
        window.localStorage.removeItem(sincroSettingsStorageKey(page));
    }
    window.history.replaceState(window.history.state, "", url);
    window.location.reload();
}
