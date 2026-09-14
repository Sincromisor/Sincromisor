import { useState } from "react";
import { resetSincroAppSettings } from "../../../../app/settings/sincroAppSettingsReset";
import { SettingsButton } from "../primitives/settingsActionControls";

/** 起動前後で同じ削除確認・進捗・再実行の案内を表示する。 */
export function ResetSettingsButton() {
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const reset = async () => {
        setPending(true);
        setFailed(false);
        try {
            await resetSincroAppSettings();
        } catch {
            setFailed(true);
        } finally {
            setPending(false);
        }
    };
    return (
        <div>
            <SettingsButton type="button" disabled={pending} onClick={() => void reset()}>
                {pending ? "初期設定に戻しています…" : "全て初期設定に戻す"}
            </SettingsButton>
            {failed && (
                <p role="alert">
                    初期化に失敗しました。一部は削除済みの可能性があります。設定の保存を停止しています。再実行してください。
                </p>
            )}
        </div>
    );
}
