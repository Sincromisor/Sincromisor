import { SincroAppController } from "../../app/controller";
import { SincroVRMInitializer } from "../../character/scene/sincroVrmInitializer";
import { frontendLogger } from "../../shared/logging/appLogger";

// 通常会話ページの入口。
// HTML から最初に読み込まれ、起動判断やUI配線の本体は SincroVRMInitializer へ委譲する。
window.addEventListener("load", () => {
    void SincroVRMInitializer.bootstrap()
        .then(() => {
            // トップの選択を起動前設定へ一度反映する。任意のURL入力は既知の2値だけ受け付け、
            // 未指定・不正値は既定設定を維持する。以後の変更は通常の設定UIへ委ねる。
            const talkMode = new URLSearchParams(window.location.search).get("talkMode");
            if (talkMode === "chat" || talkMode === "sincro") {
                SincroAppController.getCurrent()?.applySettings({ talkMode });
            }
        })
        .catch((error) => {
            frontendLogger.error("Failed to bootstrap simple-vrm page.", { error });
        });
});
