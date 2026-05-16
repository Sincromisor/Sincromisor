// @ts-expect-error `@lookingglass/webxr` は型定義が不完全なため最小ラッパーで吸収する。
import { LookingGlassConfig, LookingGlassWebXRPolyfill } from "@lookingglass/webxr";
import type { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import type { Scene } from "three/src/scenes/Scene.js";
import { getLookingGlassRuntimeConfig } from "./LookingGlassRuntimeConfig";

type LookingGlassStateEventDetail = {
    state: "idle" | "starting" | "recovering" | "active" | "error";
    code?:
        | "button_not_found"
        | "webxr_unavailable"
        | "session_start_failed"
        | "polyfill_init_failed"
        | "retry_after_error"
        | "session_ended";
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
    trackballX?: number;
    trackballY?: number;
};

// Babylon legacy の Looking Glass 起動処理を、Three.js/VRM1.0 側で再利用可能な最小コントローラとして切り出す。
export class LookingGlassXRController {
    // Preview 側（LookingGlassVRMScene）の視点補正と揃えるための LG セッション既定ピッチ。
    // @lookingglass/webxr では trackballY が pitch 相当（radian）。
    private static readonly DEFAULT_TRACKBALL_PITCH_DEG = 25;
    private readonly renderer: WebGLRenderer;
    private readonly scene: Scene;
    private readonly startButtonSelector: string;
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
            this.applyDefaultLookingGlassViewAngles();

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
                this.renderer.xr.enabled = false;
                this.renderer.domElement.style.display = "";
                this.restoreExternalCanvasPointerEvents();
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
            });
            // Three.js の XR session 設定後に通常 canvas を隠す。失敗時に先に隠さないよう順序を守る。
            await this.renderer.xr.setSession(xrSession);

            // Looking Glass セッション中は通常キャンバスを隠し、既存 UX（legacy）に寄せる。
            this.renderer.domElement.style.display = "none";
            this.disableExternalCanvasPointerEvents();
            if (startButton) {
                startButton.disabled = true;
            }
            console.log("Looking Glass WebXR session started (Three.js/VRM1.0).");
            this.successfulSessionStarts += 1;
            this.rebindLookingGlassInputHooks();
            // @lookingglass/webxr 側のマウス入力が再開後に死ぬ環境向けの保険。
            // 初回は vendor 実装を優先し、再開以降のみ fallback 操作を有効化する。
            if (this.successfulSessionStarts >= 2) {
                this.installFallbackPopupInteractionControls();
            }
            this.focusLookingGlassInteractiveSurface();
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
            // LG セッション中の視点は Three.js カメラではなく polyfill 設定で決まるため、
            // preview と同じ「やや上から」の見え方に合わせる既定ピッチをここで与える。
            trackballX: 0,
            trackballY: (LookingGlassXRController.DEFAULT_TRACKBALL_PITCH_DEG * Math.PI) / 180,
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
        // polyfill 再初期化の有無に関わらず、セッション開始時に既定の視点角を再適用する。
        // @lookingglass/webxr の内部状態はグローバルに残るため、停止/再開後に前回値が残る環境差を吸収する。
        const config = LookingGlassConfig as typeof LookingGlassConfig & {
            trackballX?: number;
            trackballY?: number;
        };
        config.trackballX = 0;
        config.trackballY = (LookingGlassXRController.DEFAULT_TRACKBALL_PITCH_DEG * Math.PI) / 180;
    }

    private focusLookingGlassInteractiveSurface(): void {
        // 再開後セッションで lkgCanvas 側の入力が死ぬケースに対し、popup/canvas を明示フォーカスする。
        // @lookingglass/webxr のマウス/キー操作は lkgCanvas/appCanvas に直接 listener を張っている。
        const config = LookingGlassConfig as typeof LookingGlassConfig & {
            popup?: Window | null;
            lkgCanvas?: HTMLCanvasElement | null;
            appCanvas?: HTMLCanvasElement | null;
        };
        requestAnimationFrame(() => {
            try {
                config.popup?.focus?.();
                if (config.lkgCanvas) {
                    config.lkgCanvas.style.pointerEvents = "auto";
                    config.lkgCanvas.tabIndex =
                        config.lkgCanvas.tabIndex >= 0 ? config.lkgCanvas.tabIndex : 0;
                    config.lkgCanvas.focus();
                }
                config.appCanvas?.blur?.();
            } catch (error) {
                console.warn("Failed to focus Looking Glass popup/canvas.", error);
            }
        });
    }

    private rebindLookingGlassInputHooks(): void {
        // @lookingglass/webxr のマウス操作は lkgCanvas/appCanvas に直接 listener を張る実装。
        // 再開時に listener が新しい canvas へ移らないケースに備え、公開 config API で再登録を促す。
        // 期待動作: vendor 側が updateViewControls 経由で listener を再接続すること。
        // 実際には効かない環境があるため、fallback controls を併用している（本関数だけでは不十分）。
        const config = LookingGlassConfig as typeof LookingGlassConfig & {
            appCanvas?: HTMLCanvasElement | null;
            lkgCanvas?: HTMLCanvasElement | null;
            updateViewControls?: (partial: {
                appCanvas?: HTMLCanvasElement | null;
                lkgCanvas?: HTMLCanvasElement | null;
            }) => void;
        };
        const rebind = () => {
            try {
                config.updateViewControls?.({
                    appCanvas: config.appCanvas ?? null,
                    lkgCanvas: config.lkgCanvas ?? null,
                });
            } catch (error) {
                console.warn("Failed to rebind Looking Glass input hooks.", error);
            }
        };
        // 初期化直後と popup/canvas 配置後の両方を拾うため、数フレームずらして実行する。
        rebind();
        requestAnimationFrame(rebind);
        requestAnimationFrame(() => requestAnimationFrame(rebind));
    }

    private installFallbackPopupInteractionControls(): void {
        // vendor 側 listener が再開時に無効化されるケース向けの最小代替操作。
        // LookingGlassConfig の trackball / target / targetDiam を直接更新して同等の視点操作を提供する。
        // この処理は暫定回避策。vendor 側で再開後 input が安定したら削除対象。
        // 削除時は「再開後でも wheel / 左ドラッグ / 右ドラッグ(または shift+左) が効く」ことを手動確認する。
        const config = LookingGlassConfig as typeof LookingGlassConfig & {
            lkgCanvas?: HTMLCanvasElement | null;
            appCanvas?: HTMLCanvasElement | null;
            targetDiam: number;
            trackballX: number;
            trackballY: number;
            targetX: number;
            targetY: number;
            targetZ: number;
        };
        const canvas = config.lkgCanvas;
        if (!canvas) {
            return;
        }
        if (canvas.dataset.sincroLgFallbackControlsBound === "1") {
            return;
        }
        canvas.dataset.sincroLgFallbackControlsBound = "1";

        canvas.addEventListener("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
        });
        canvas.addEventListener(
            "wheel",
            (event: WheelEvent) => {
                const zoomBase = 1.1;
                const current = Math.max(config.targetDiam ?? 1, 1e-6);
                const exponent = Math.log(current) / Math.log(zoomBase);
                config.targetDiam = Math.max(1e-4, zoomBase ** (exponent + event.deltaY * 0.01));
                event.preventDefault();
            },
            { passive: false },
        );
        canvas.addEventListener("mousemove", (event: MouseEvent) => {
            const dx = event.movementX;
            const dy = -event.movementY;
            const isPan =
                !!(event.buttons & 2) ||
                (!!(event.buttons & 1) && (event.shiftKey || event.ctrlKey));
            if (isPan) {
                const tx = config.trackballX ?? 0;
                const ty = config.trackballY ?? 0;
                const targetDiam = config.targetDiam ?? 1;
                const panX = -Math.cos(tx) * dx + Math.sin(tx) * Math.sin(ty) * dy;
                const panY = -Math.cos(ty) * dy;
                const panZ = Math.sin(tx) * dx + Math.cos(tx) * Math.sin(ty) * dy;
                config.targetX = (config.targetX ?? 0) + panX * targetDiam * 1e-3;
                config.targetY = (config.targetY ?? 0) + panY * targetDiam * 1e-3;
                config.targetZ = (config.targetZ ?? 0) + panZ * targetDiam * 1e-3;
                return;
            }
            if (event.buttons & 1) {
                config.trackballX = (config.trackballX ?? 0) - dx * 0.01;
                config.trackballY = (config.trackballY ?? 0) - dy * 0.01;
            }
        });
    }

    private disableExternalCanvasPointerEvents(): void {
        // polyfill 側が追加する canvas が pointer を奪うと OrbitControls 操作が効かなくなるため、
        // LG セッション中は renderer 本体以外の canvas を操作対象から外す。
        const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas");
        canvases.forEach((canvas) => {
            if (canvas === this.renderer.domElement) {
                return;
            }
            if (!canvas.dataset.sincroPrevPointerEvents) {
                canvas.dataset.sincroPrevPointerEvents = canvas.style.pointerEvents || "__empty__";
            }
            canvas.style.pointerEvents = "none";
        });
    }

    private restoreExternalCanvasPointerEvents(): void {
        const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas");
        canvases.forEach((canvas) => {
            if (canvas === this.renderer.domElement) {
                return;
            }
            const prev = canvas.dataset.sincroPrevPointerEvents;
            if (prev == null) {
                return;
            }
            canvas.style.pointerEvents = prev === "__empty__" ? "" : prev;
            delete canvas.dataset.sincroPrevPointerEvents;
        });
    }
}
