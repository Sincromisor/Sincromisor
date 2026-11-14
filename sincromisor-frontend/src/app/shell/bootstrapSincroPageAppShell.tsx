import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroVRMRoots } from "../bootstrap/sincroVrmInitializer";
import { getActiveSincroAppController } from "../controller/activeSincroAppController";
import { showBootstrapFailure } from "./bootstrapFailureView";
import { SincroPageAppShell } from "./sincroPageAppShell";

/** パネル読込後にReactを配置し、配置通知からページを一度だけ初期化する。再生成は扱わない。 */
export function bootstrapSincroPageAppShell<TModule>(
    loadControlPanel: () => Promise<TModule>,
    renderControlPanel: (module: TModule) => ReactElement,
    initializePage: (roots: SincroVRMRoots) => void,
): void {
    const mountNode = document.getElementById("sincroPageRoot") ?? document.createElement("div");
    // 回復はページ再読込で行う。モジュールが再取得されても同じ領域へ二重起動しない。
    if (mountNode.dataset.sincroBootstrapStarted) return;
    mountNode.dataset.sincroBootstrapStarted = "true";
    mountNode.id = "sincroPageRoot";
    if (!mountNode.isConnected) document.body.append(mountNode);
    frontendLogger.diagnostics.start();
    let root: Root | undefined;
    let failed = false;
    let initializationAttempted = false;
    const reportError = (error: unknown) => {
        if (failed) return;
        failed = true;
        frontendLogger.error("Failed to bootstrap VRM page.", { error });
        // 同期的に開始を封じてから機器を終了する。Reactの後着配置通知もfailedで拒む。
        stopFailedApp();
        mountNode.inert = true;
        // Reactの描画・effect内で通知されても、処理中のルートを同期unmountしない。
        queueMicrotask(() => {
            try {
                root?.unmount();
            } catch (cleanupError) {
                frontendLogger.error("Failed to unmount VRM page.", { error: cleanupError });
            }
            showBootstrapFailure(mountNode);
        });
    };
    const onCharacterMounted = (roots: SincroVRMRoots) => {
        if (failed || initializationAttempted) return;
        // 通知再実行や同期失敗後にも、新しいアプリとシーンを重ねて作らない。
        initializationAttempted = true;
        try {
            initializePage(roots);
        } catch (error) {
            reportError(error);
        }
    };
    void (async () => {
        const module = await loadControlPanel();
        const controlPanel = renderControlPanel(module);
        if (failed) return;
        root = createRoot(mountNode, { onUncaughtError: reportError });
        root.render(
            <SincroPageAppShell
                controlPanel={controlPanel}
                onCharacterMounted={onCharacterMounted}
            />,
        );
    })().catch(reportError);
}

/** 解除を先行して待機中の開始を拒否し、解除の失敗時にも機器終了を試みる。 */
function stopFailedApp(): void {
    const app = getActiveSincroAppController();
    if (!app) return;
    try {
        app.releaseEventSubscriptions();
    } catch (error) {
        frontendLogger.error("Failed to release failed VRM app.", { error });
    }
    try {
        app.endExperience();
    } catch (error) {
        // 終了の失敗を記録しても、回復画面の表示は妨げない。
        frontendLogger.error("Failed to end failed VRM app.", { error });
    }
}
