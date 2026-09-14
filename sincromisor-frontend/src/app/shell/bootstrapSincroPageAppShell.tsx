import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroVRMRoots } from "../bootstrap/sincroVrmInitializer";
import { SincroPageAppShell } from "./sincroPageAppShell";

/** パネル読込後にReactを配置し、配置通知からページを一度だけ初期化する。再生成は扱わない。 */
export function bootstrapSincroPageAppShell<TModule>(
    loadControlPanel: () => Promise<TModule>,
    renderControlPanel: (module: TModule) => ReactElement,
    initializePage: (roots: SincroVRMRoots) => void,
): void {
    let initializationAttempted = false;
    const reportError = (error: unknown) => {
        frontendLogger.error("Failed to bootstrap VRM page.", { error });
    };
    const onCharacterMounted = (roots: SincroVRMRoots) => {
        if (initializationAttempted) return;
        // 通知再実行や同期失敗後にも、新しいアプリとシーンを重ねて作らない。
        initializationAttempted = true;
        try {
            initializePage(roots);
        } catch (error) {
            reportError(error);
        }
    };
    void (async () => {
        const mountNode = document.getElementById("sincroPageRoot");
        if (!mountNode) throw new Error("div#sincroPageRoot is not found.");
        const module = await loadControlPanel();
        const controlPanel = renderControlPanel(module);
        createRoot(mountNode, { onUncaughtError: reportError }).render(
            <SincroPageAppShell
                controlPanel={controlPanel}
                onCharacterMounted={onCharacterMounted}
            />,
        );
    })().catch(reportError);
}
