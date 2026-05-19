import { LookingGlassConfig } from "@lookingglass/webxr";
import { frontendLogger } from "../../logging/appLogger";

// @lookingglass/webxr の再開後入力が失われる環境向けの復旧処理をまとめる。
export class LookingGlassInputRecovery {
    focusInteractiveSurface(): void {
        // 再開後セッションで lkgCanvas 側の入力が死ぬケースに対し、popup/canvas を明示フォーカスする。
        // @lookingglass/webxr のマウス/キー操作は lkgCanvas/appCanvas に直接 listener を張っている。
        requestAnimationFrame(() => {
            try {
                LookingGlassConfig.popup?.focus?.();
                if (LookingGlassConfig.lkgCanvas) {
                    LookingGlassConfig.lkgCanvas.style.pointerEvents = "auto";
                    LookingGlassConfig.lkgCanvas.tabIndex =
                        LookingGlassConfig.lkgCanvas.tabIndex >= 0
                            ? LookingGlassConfig.lkgCanvas.tabIndex
                            : 0;
                    LookingGlassConfig.lkgCanvas.focus();
                }
                LookingGlassConfig.appCanvas?.blur?.();
            } catch (error) {
                frontendLogger.warn("Failed to focus Looking Glass popup/canvas.", { error });
            }
        });
    }

    rebindInputHooks(): void {
        // @lookingglass/webxr のマウス操作は lkgCanvas/appCanvas に直接 listener を張る実装。
        // 再開時に listener が新しい canvas へ移らないケースに備え、公開 config API で再登録を促す。
        // 期待動作: vendor 側が updateViewControls 経由で listener を再接続すること。
        // 実際には効かない環境があるため、fallback controls を併用している（本関数だけでは不十分）。
        const rebind = () => {
            try {
                LookingGlassConfig.updateViewControls?.({
                    appCanvas: LookingGlassConfig.appCanvas ?? null,
                    lkgCanvas: LookingGlassConfig.lkgCanvas ?? null,
                });
            } catch (error) {
                frontendLogger.warn("Failed to rebind Looking Glass input hooks.", { error });
            }
        };
        // 初期化直後と popup/canvas 配置後の両方を拾うため、数フレームずらして実行する。
        rebind();
        requestAnimationFrame(rebind);
        requestAnimationFrame(() => requestAnimationFrame(rebind));
    }

    installFallbackPopupInteractionControls(): void {
        // vendor 側 listener が再開時に無効化されるケース向けの最小代替操作。
        // LookingGlassConfig の trackball / target / targetDiam を直接更新して同等の視点操作を提供する。
        // この処理は暫定回避策。vendor 側で再開後 input が安定したら削除対象。
        // 削除時は「再開後でも wheel / 左ドラッグ / 右ドラッグ(または shift+左) が効く」ことを手動確認する。
        const canvas = LookingGlassConfig.lkgCanvas;
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
            (event: WheelEvent) => handleFallbackWheel(event, LookingGlassConfig),
            { passive: false },
        );
        canvas.addEventListener("mousemove", (event: MouseEvent) =>
            handleFallbackMouseMove(event, LookingGlassConfig),
        );
    }
}

type FallbackLookingGlassConfig = typeof LookingGlassConfig;

function handleFallbackWheel(event: WheelEvent, config: FallbackLookingGlassConfig): void {
    const zoomBase = 1.1;
    const current = Math.max(config.targetDiam ?? 1, 1e-6);
    const exponent = Math.log(current) / Math.log(zoomBase);
    config.targetDiam = Math.max(1e-4, zoomBase ** (exponent + event.deltaY * 0.01));
    event.preventDefault();
}

function handleFallbackMouseMove(event: MouseEvent, config: FallbackLookingGlassConfig): void {
    const dx = event.movementX;
    const dy = -event.movementY;
    const isPan =
        !!(event.buttons & 2) || (!!(event.buttons & 1) && (event.shiftKey || event.ctrlKey));
    if (isPan) {
        panFallbackTarget(config, dx, dy);
        return;
    }
    if (event.buttons & 1) {
        config.trackballX = (config.trackballX ?? 0) - dx * 0.01;
        config.trackballY = (config.trackballY ?? 0) - dy * 0.01;
    }
}

function panFallbackTarget(config: FallbackLookingGlassConfig, dx: number, dy: number): void {
    const tx = config.trackballX ?? 0;
    const ty = config.trackballY ?? 0;
    const targetDiam = config.targetDiam ?? 1;
    const panX = -Math.cos(tx) * dx + Math.sin(tx) * Math.sin(ty) * dy;
    const panY = -Math.cos(ty) * dy;
    const panZ = Math.sin(tx) * dx + Math.cos(tx) * Math.sin(ty) * dy;
    config.targetX = (config.targetX ?? 0) + panX * targetDiam * 1e-3;
    config.targetY = (config.targetY ?? 0) + panY * targetDiam * 1e-3;
    config.targetZ = (config.targetZ ?? 0) + panZ * targetDiam * 1e-3;
}
