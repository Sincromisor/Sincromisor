import { SincroVRMInitializer } from "../../character/scene/sincroVrmInitializer";
import { frontendLogger } from "../../shared/logging/appLogger";

// ページ設定を初期化へ渡し、OBS自動開始より前に確定する。任意のURL入力は既知の2値だけ許可する。
window.addEventListener("load", () => {
    const talkMode = new URLSearchParams(window.location.search).get("talkMode");
    void SincroVRMInitializer.bootstrap(
        talkMode === "chat" || talkMode === "sincro" ? { talkMode } : {},
    ).catch((error) => {
        frontendLogger.error("Failed to bootstrap simple-vrm page.", { error });
    });
});
