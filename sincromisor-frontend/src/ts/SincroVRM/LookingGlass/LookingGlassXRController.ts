import type { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import type { Scene } from "three/src/scenes/Scene.js";
import { frontendLogger } from "../../logging/appLogger";
import {
    disableExternalCanvasPointerEvents,
    restoreExternalCanvasPointerEvents,
} from "./lookingGlassCanvasPointerEvents";
import { LookingGlassInputRecovery } from "./lookingGlassInputRecovery";
import {
    applyDefaultLookingGlassViewAngles,
    initializeLookingGlassPolyfill,
} from "./lookingGlassPolyfillLifecycle";
import type { LookingGlassStateEventDetail } from "./lookingGlassWebXrState";

// Babylon legacy の Looking Glass 起動処理を、Three.js/VRM1.0 側で再利用可能な最小コントローラとして切り出す。
export class LookingGlassXRController {
    private readonly renderer: WebGLRenderer;
    private readonly scene: Scene;
    private readonly startButtonSelector: string;
    private readonly inputRecovery = new LookingGlassInputRecovery();
    private polyfillInitialized = false;
    private polyfillSessionWarmupDone = false;
    private pendingPolyfillReinitAfterSessionEnd = false;
    private isStarting = false;
    private commandEventsBound = false;
    private lastState: LookingGlassStateEventDetail["state"] = "idle";
    private successfulSessionStarts = 0;
    // NOTE(2026-02-23):
    // 一部環境で「LG セッション停止 -> 再開」後に @lookingglass/webxr の mouse/wheel 操作が効かなくなる。
    // 現状は vendor 側再現に依存するため、ここで以下の段階的回復策を持つ:
    // 1) canvas 参照の再通知 (rebindLookingGlassInputHooks)
    // 2) popup / lkgCanvas の明示 focus
    // 3) 再開後のみ fallback mouse controls を注入 (installFallbackPopupInteractionControls)
    // 将来リファクタ時は vendor 側の修正確認後に 3) を削除し、2)→1) の順で簡素化可否を再評価する。

    constructor(
        renderer: WebGLRenderer,
        scene: Scene,
        startButtonSelector: string = "button#startLookingGlass",
    ) {
        this.renderer = renderer;
        this.scene = scene;
        this.startButtonSelector = startButtonSelector;
        // React UI からのLG設定更新を、次回 start() の polyfill 初期化へ反映する。
        window.addEventListener(
            "sincro:looking-glass-config-updated",
            this.handleConfigUpdated as EventListener,
        );
        // Debug Console 以外（React 設定パネル等）からも起動/停止できるようにする。
        this.bindCommandEvents();
    }

    attachToStartButton(): void {
        // Debug Console 互換の旧導線。現在は Control Panel 側 custom event 導線が主経路。
        const startButton = document.querySelector<HTMLButtonElement>(this.startButtonSelector);
        if (!startButton) {
            // Debug Console 側ボタンを使わないページ/構成でも、Control Panel 経由の custom event 操作は有効。
            // ボタン未配置は異常ではないため error にせず idle のまま扱う。
            return;
        }

        if (startButton.dataset.sincroLookingGlassBound === "1") {
            return;
        }
        startButton.dataset.sincroLookingGlassBound = "1";

        // 旧Debug Console ボタンとの互換経路。現在の主導線は Control Panel 側 custom event。
        startButton.addEventListener("click", () => {
            void this.start(startButton);
        });
        this.emitState({ state: "idle" });
    }

    async stop(): Promise<void> {
        // stop は「セッション終了 -> 次回 start で最新設定を反映」の導線に使う。
        const currentSession = this.renderer.xr.getSession();
        if (!currentSession) {
            return;
        }
        try {
            await currentSession.end();
        } catch (error) {
            frontendLogger.error("Failed to stop Looking Glass WebXR session.", { error });
            const message = error instanceof Error ? error.message : String(error);
            this.emitState({ state: "error", code: "session_start_failed", message });
        }
    }

    async start(startButton?: HTMLButtonElement): Promise<void> {
        if (this.isStarting) {
            return;
        }
        this.isStarting = true;

        try {
            await this.prepareSessionStart();
            const xrSession = await this.requestLookingGlassSession(startButton);
            // Three.js の XR session 設定後に通常 canvas を隠す。失敗時に先に隠さないよう順序を守る。
            await this.renderer.xr.setSession(xrSession);
            this.activateLookingGlassSession(startButton);
        } catch (error) {
            this.handleSessionStartError(error);
        } finally {
            this.isStarting = false;
        }
    }

    private async prepareSessionStart(): Promise<void> {
        if (this.lastState === "error" || this.lastState === "recovering") {
            this.emitState({
                state: "recovering",
                code: "retry_after_error",
                message: "retrying Looking Glass session start",
            });
        }
        this.emitState({ state: "starting" });
        // 非active時に設定変更されていれば、handleConfigUpdated() で false に戻される。
        this.ensurePolyfill();
        this.applyDefaultLookingGlassViewAngles();

        if (!("xr" in navigator) || !navigator.xr) {
            throw new Error("WebXR API is not available in this browser.");
        }

        await this.ensurePolyfillSessionWarmup();
        this.renderer.xr.enabled = true;
    }

    private async requestLookingGlassSession(
        startButton: HTMLButtonElement | undefined,
    ): Promise<XRSession> {
        const xrSession = await navigator.xr?.requestSession("immersive-vr", {
            optionalFeatures: ["local-floor"],
        });
        if (!xrSession) {
            throw new Error("WebXR API is not available in this browser.");
        }
        xrSession.addEventListener("end", () => {
            this.handleSessionEnd(startButton);
        });
        return xrSession;
    }

    private handleSessionEnd(startButton: HTMLButtonElement | undefined): void {
        this.renderer.xr.enabled = false;
        this.renderer.domElement.style.display = "";
        restoreExternalCanvasPointerEvents(this.renderer.domElement);
        if (startButton) {
            startButton.disabled = false;
        }
        // 実行中に設定変更された場合だけ、終了後に次回再起動向け reinit を許可する。
        if (this.pendingPolyfillReinitAfterSessionEnd) {
            this.pendingPolyfillReinitAfterSessionEnd = false;
            this.markPolyfillReinitReady();
        }
        this.emitState({
            state: "recovering",
            code: "session_ended",
            message: "session ended; ready to retry",
        });
    }

    private activateLookingGlassSession(startButton: HTMLButtonElement | undefined): void {
        // Looking Glass セッション中は通常キャンバスを隠し、既存 UX（legacy）に寄せる。
        this.renderer.domElement.style.display = "none";
        disableExternalCanvasPointerEvents(this.renderer.domElement);
        if (startButton) {
            startButton.disabled = true;
        }
        frontendLogger.info("Looking Glass WebXR session started.");
        this.successfulSessionStarts += 1;
        this.inputRecovery.rebindInputHooks();
        // @lookingglass/webxr 側のマウス入力が再開後に死ぬ環境向けの保険。
        // 初回は vendor 実装を優先し、再開以降のみ fallback 操作を有効化する。
        if (this.successfulSessionStarts >= 2) {
            this.inputRecovery.installFallbackPopupInteractionControls();
        }
        this.inputRecovery.focusInteractiveSurface();
        this.emitState({ state: "active" });
    }

    private handleSessionStartError(error: unknown): void {
        frontendLogger.error("Failed to start Looking Glass WebXR session.", { error });
        const message = error instanceof Error ? error.message : String(error);
        const code = message.includes("WebXR API is not available")
            ? "webxr_unavailable"
            : "session_start_failed";
        this.emitState({ state: "error", code, message });
    }

    private ensurePolyfill(): void {
        if (this.polyfillInitialized) {
            return;
        }
        // scene を受け取っているのは将来の Three.js 側統合（camera target 等）拡張用。
        void this.scene;

        try {
            initializeLookingGlassPolyfill();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.emitState({ state: "error", code: "polyfill_init_failed", message });
            throw error;
        }
        this.polyfillInitialized = true;
    }

    private async ensurePolyfillSessionWarmup(): Promise<void> {
        if (this.polyfillSessionWarmupDone) {
            return;
        }
        if (!navigator.xr) {
            return;
        }
        // @lookingglass/webxr polyfill は初回 immersive session の前に
        // isSessionSupported(...) か inline session 要求を一度通す必要がある。
        // native 実装では不要だが、polyfill 環境で「1回目だけ失敗」を避けるために実施する。
        try {
            await navigator.xr.isSessionSupported("immersive-vr");
            this.polyfillSessionWarmupDone = true;
        } catch {
            // isSessionSupported が失敗しても requestSession 側で最終エラーを出す。
            // ここでは polyfill 制約回避のベストエフォートとして扱う。
        }
    }

    private emitState(detail: LookingGlassStateEventDetail): void {
        // AppController 側で tracker 更新と UI 用 event へ再構成するため、window custom event で橋渡しする。
        this.lastState = detail.state;
        window.dispatchEvent(
            new CustomEvent<LookingGlassStateEventDetail>("sincro:looking-glass-state", { detail }),
        );
    }

    private readonly handleConfigUpdated = (): void => {
        // セッション実行中は現在の polyfill を維持し、終了後の再起動で適用する。
        if (this.lastState === "active" || this.lastState === "starting") {
            this.pendingPolyfillReinitAfterSessionEnd = true;
            return;
        }
        // 次回 start() で runtime config を再読込して polyfill を再初期化できるようにする。
        this.markPolyfillReinitReady();
    };

    private markPolyfillReinitReady(): void {
        if (!this.polyfillInitialized && !this.polyfillSessionWarmupDone) {
            return;
        }
        this.polyfillInitialized = false;
        this.polyfillSessionWarmupDone = false;
        // AppController 側で config status を「次回セッション反映可能」に再評価するトリガ。
        window.dispatchEvent(new CustomEvent("sincro:looking-glass-polyfill-reinit-ready"));
    }

    private bindCommandEvents(): void {
        if (this.commandEventsBound) {
            return;
        }
        this.commandEventsBound = true;
        // looking-glass-vrm の Control Panel から start/stop を操作する導線。
        window.addEventListener(
            "sincro:looking-glass-start-request",
            this.handleExternalStartRequest as EventListener,
        );
        window.addEventListener(
            "sincro:looking-glass-stop-request",
            this.handleExternalStopRequest as EventListener,
        );
    }

    private readonly handleExternalStartRequest = (): void => {
        void this.start();
    };

    private readonly handleExternalStopRequest = (): void => {
        void this.stop();
    };

    private applyDefaultLookingGlassViewAngles(): void {
        applyDefaultLookingGlassViewAngles();
    }
}
