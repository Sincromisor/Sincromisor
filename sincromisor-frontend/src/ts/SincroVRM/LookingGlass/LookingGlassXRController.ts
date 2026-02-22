import type { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import type { Scene } from "three/src/scenes/Scene.js";
import { getLookingGlassRuntimeConfig } from "./LookingGlassRuntimeConfig";

// @ts-ignore `@lookingglass/webxr` は型定義が不完全なため最小ラッパーで吸収する。
import { LookingGlassWebXRPolyfill } from "@lookingglass/webxr";

type LookingGlassStateEventDetail = {
    state: "idle" | "starting" | "recovering" | "active" | "error";
    code?: "button_not_found" | "webxr_unavailable" | "session_start_failed" | "polyfill_init_failed" | "retry_after_error" | "session_ended";
    message?: string;
};

type LookingGlassPolyfillOptions = {
    tileHeight: number;
    numViews: number;
    targetX: number;
    targetY: number;
    targetZ: number;
    targetDiam: number;
    fovy: number;
    depthiness: number;
};

// Babylon legacy の Looking Glass 起動処理を、Three.js/VRM1.0 側で再利用可能な最小コントローラとして切り出す。
export class LookingGlassXRController {
    private readonly renderer: WebGLRenderer;
    private readonly scene: Scene;
    private readonly startButtonSelector: string;
    private polyfillInitialized = false;
    private polyfillSessionWarmupDone = false;
    private isStarting = false;
    private commandEventsBound = false;
    private lastState: LookingGlassStateEventDetail["state"] = "idle";

    constructor(
        renderer: WebGLRenderer,
        scene: Scene,
        startButtonSelector: string = "button#startLookingGlass",
    ) {
        this.renderer = renderer;
        this.scene = scene;
        this.startButtonSelector = startButtonSelector;
        // React UI からのLG設定更新を、次回 start() の polyfill 初期化へ反映する。
        window.addEventListener("sincro:looking-glass-config-updated", this.handleConfigUpdated as EventListener);
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
            console.error("Failed to stop Looking Glass WebXR session.", error);
            const message = error instanceof Error ? error.message : String(error);
            this.emitState({ state: "error", code: "session_start_failed", message });
        }
    }

    async start(startButton?: HTMLButtonElement): Promise<void> {
        if (this.isStarting) {
            return;
        }
        this.isStarting = true;
        if (this.lastState === "error" || this.lastState === "recovering") {
            this.emitState({
                state: "recovering",
                code: "retry_after_error",
                message: "retrying Looking Glass session start",
            });
        }
        this.emitState({ state: "starting" });

        try {
            // 非active時に設定変更されていれば、handleConfigUpdated() で false に戻される。
            this.ensurePolyfill();

            if (!("xr" in navigator) || !navigator.xr) {
                throw new Error("WebXR API is not available in this browser.");
            }

            await this.ensurePolyfillSessionWarmup();

            this.renderer.xr.enabled = true;
            const sessionInit: XRSessionInit = {
                optionalFeatures: ["local-floor"],
            };
            const xrSession = await navigator.xr.requestSession("immersive-vr", sessionInit);
            xrSession.addEventListener("end", () => {
                this.renderer.domElement.style.display = "";
                if (startButton) {
                    startButton.disabled = false;
                }
                // セッション終了後は最新の runtime config で再起動できるよう、polyfill を次回再初期化可能に戻す。
                this.markPolyfillReinitReady();
                this.emitState({
                    state: "recovering",
                    code: "session_ended",
                    message: "session ended; ready to retry",
                });
            });
            // Three.js の XR session 設定後に通常 canvas を隠す。失敗時に先に隠さないよう順序を守る。
            await this.renderer.xr.setSession(xrSession);

            // Looking Glass セッション中は通常キャンバスを隠し、既存 UX（legacy）に寄せる。
            this.renderer.domElement.style.display = "none";
            if (startButton) {
                startButton.disabled = true;
            }
            console.log("Looking Glass WebXR session started (Three.js/VRM1.0).");
            this.emitState({ state: "active" });
        } catch (error) {
            console.error("Failed to start Looking Glass WebXR session.", error);
            const message = error instanceof Error ? error.message : String(error);
            const code = message.includes("WebXR API is not available")
                ? "webxr_unavailable"
                : "session_start_failed";
            this.emitState({ state: "error", code, message });
        } finally {
            this.isStarting = false;
        }
    }

    private ensurePolyfill(): void {
        if (this.polyfillInitialized) {
            return;
        }
        // scene を受け取っているのは将来の Three.js 側統合（camera target 等）拡張用。
        void this.scene;

        // polyfill は生成時オプションを持つため、毎回 runtime config を読み直して初期化する。
        const runtimeConfig = getLookingGlassRuntimeConfig();
        const options: LookingGlassPolyfillOptions = {
            tileHeight: runtimeConfig.tileHeight,
            numViews: runtimeConfig.numViews,
            targetX: 0,
            targetY: runtimeConfig.targetY,
            targetZ: runtimeConfig.targetZ,
            targetDiam: runtimeConfig.targetDiam,
            fovy: (runtimeConfig.fovyDeg * Math.PI) / 180,
            depthiness: runtimeConfig.depthiness,
        };
        try {
            new LookingGlassWebXRPolyfill(options);
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
        window.dispatchEvent(new CustomEvent<LookingGlassStateEventDetail>("sincro:looking-glass-state", { detail }));
    }

    private readonly handleConfigUpdated = (): void => {
        // セッション実行中は現在の polyfill を維持し、終了後の再起動で適用する。
        if (this.lastState === "active" || this.lastState === "starting") {
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
        window.addEventListener("sincro:looking-glass-start-request", this.handleExternalStartRequest as EventListener);
        window.addEventListener("sincro:looking-glass-stop-request", this.handleExternalStopRequest as EventListener);
    }

    private readonly handleExternalStartRequest = (): void => {
        void this.start();
    };

    private readonly handleExternalStopRequest = (): void => {
        void this.stop();
    };
}
