// @ts-expect-error `@lookingglass/webxr` は型定義が不完全なため最小ラッパーで吸収する。
import { LookingGlassConfig, LookingGlassWebXRPolyfill } from "@lookingglass/webxr";
import { getLookingGlassRuntimeConfig } from "./lookingGlassRuntimeConfig";

export const DEFAULT_LOOKING_GLASS_TRACKBALL_PITCH_DEG = 25;

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

// polyfill は生成時オプションを保持するため、起動直前に runtime config を読み込んで初期化する。
export function initializeLookingGlassPolyfill(): void {
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
        trackballY: (DEFAULT_LOOKING_GLASS_TRACKBALL_PITCH_DEG * Math.PI) / 180,
    };
    new LookingGlassWebXRPolyfill(options);
}

export function applyDefaultLookingGlassViewAngles(): void {
    // polyfill 再初期化の有無に関わらず、セッション開始時に既定の視点角を再適用する。
    // @lookingglass/webxr の内部状態はグローバルに残るため、停止/再開後に前回値が残る環境差を吸収する。
    const config = LookingGlassConfig as typeof LookingGlassConfig & {
        trackballX?: number;
        trackballY?: number;
    };
    config.trackballX = 0;
    config.trackballY = (DEFAULT_LOOKING_GLASS_TRACKBALL_PITCH_DEG * Math.PI) / 180;
}
