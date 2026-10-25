import { createPortal } from "react-dom";
import { useChatSnapshot } from "../../../features/conversation/chat/react/useChatSnapshot";
import { SettingsButton } from "../../../features/settings/react/primitives/settingsActionControls";
import { SincroAppController } from "../../controller";
import { audioInputFailureMessage } from "../../controller/sincroAudioInputState";
import { useRightToolPanelState } from "../../react/useRightToolPanelState";
import { useSincroAppControllerSettingsState } from "../../react/useSincroAppControllerSettingsState";
import { useSincroExperienceState } from "../../react/useSincroExperienceState";
import "./importantNotice.css";

/** エラーと未保存状態を会話の背面から分離し、起動前はダイアログ内、通常時は前面へ一度だけ表示する。 */
export function ImportantNotice({ floating = false }: { floating?: boolean }) {
    const { importantNotice } = useChatSnapshot();
    const { saveFailed, currentController } = useSincroAppControllerSettingsState();
    const { activePanel } = useRightToolPanelState();
    const { audioInput, controller } = useSincroExperienceState();
    const inputFailed = audioInput.status === "failed";
    // パネル操作を覆わないよう、開いている外枠が確保した領域へ通知を移す。
    const panelTarget =
        floating && activePanel !== "none" && typeof document !== "undefined"
            ? document.getElementById(`${activePanel}ImportantNoticeRoot`)
            : undefined;
    if (!importantNotice && !saveFailed && !inputFailed) return null;
    const notice = (
        <section
            className={`sincroImportantNotice${floating && !panelTarget ? " sincroImportantNotice--floating" : ""}`}
            role="alert"
            aria-label="重要な通知"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: 長い通知をキーボードでスクロールして全文確認できるようにする。
            tabIndex={0}
        >
            {/* 音声失敗は履歴へ複製せず現在状態から表示し、再取得・終了で直ちに消す。 */}
            {audioInput.status === "failed" && (
                <div>
                    <p>{audioInputFailureMessage(audioInput.reason)}</p>
                    <SettingsButton type="button" onClick={() => controller?.retryAudioInput()}>
                        マイクを再試行
                    </SettingsButton>
                </div>
            )}
            {saveFailed && (
                <div>
                    <p>設定が未保存です。再読み込みすると変更が失われます。</p>
                    <SettingsButton
                        type="button"
                        onClick={() => currentController?.retrySettingsSave()}
                    >
                        保存を再試行
                    </SettingsButton>
                </div>
            )}
            {importantNotice && (
                <div>
                    <p>{importantNotice.message.message}</p>
                    <SettingsButton
                        type="button"
                        onClick={() =>
                            SincroAppController.getCurrent()?.chat.dismissImportantNotice()
                        }
                    >
                        通知を閉じる
                    </SettingsButton>
                </div>
            )}
        </section>
    );
    // 通常通知も共通画面の重なり順へ参加させ、狭幅で右上メニューを覆わない。
    const target = panelTarget ?? (floating ? document.getElementById("sincroBody") : undefined);
    return target ? createPortal(notice, target) : notice;
}
