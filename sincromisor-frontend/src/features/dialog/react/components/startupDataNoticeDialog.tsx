import { useId } from "react";
import { createPortal } from "react-dom";
import type { SincroAppSettingsSnapshot } from "../../../../app/controller";
import { StartupMediaNotice } from "./startupMediaNotice";
import "./startupDataNoticeDialog.css";

/** ヘッダーから説明を開き、閉じた後のフォーカス復帰は標準dialogへ委ねる。 */
export function StartupDataNoticeDialog({ settings }: { settings: SincroAppSettingsSnapshot }) {
    const dialogId = useId();
    const titleId = useId();

    // 起動前設定のEsc抑止が届かないよう、説明モーダルはbody直下へ配置する。
    return (
        <>
            <button
                type="button"
                className="configurationDialogReactSettingsPanel__backLink"
                {...{ command: "show-modal", commandfor: dialogId }}
                aria-haspopup="dialog"
            >
                データの扱いについて
            </button>
            {createPortal(
                <dialog
                    id={dialogId}
                    className="startupDataNoticeDialog"
                    aria-labelledby={titleId}
                    closedby="any"
                >
                    <h2 id={titleId}>データの扱いについて</h2>
                    <StartupMediaNotice settings={settings} />
                    <form method="dialog">
                        <button
                            type="submit"
                            className="settingsPrimitiveButton"
                            // biome-ignore lint/a11y/noAutofocus: 利用者が開いたモーダルの閉じる操作を初期フォーカスにする。
                            autoFocus
                        >
                            閉じる
                        </button>
                    </form>
                </dialog>,
                document.body,
            )}
        </>
    );
}
