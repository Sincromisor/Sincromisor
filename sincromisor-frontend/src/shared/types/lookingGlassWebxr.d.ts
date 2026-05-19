declare module "@lookingglass/webxr" {
    export type LookingGlassViewControls = {
        appCanvas?: HTMLCanvasElement | null;
        lkgCanvas?: HTMLCanvasElement | null;
    };

    export type LookingGlassPolyfillOptions = {
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

    export const LookingGlassConfig: {
        popup?: Window | null;
        lkgCanvas?: HTMLCanvasElement | null;
        appCanvas?: HTMLCanvasElement | null;
        targetDiam?: number;
        trackballX?: number;
        trackballY?: number;
        targetX?: number;
        targetY?: number;
        targetZ?: number;
        updateViewControls?: (partial: LookingGlassViewControls) => void;
    };

    export class LookingGlassWebXRPolyfill {
        constructor(options: LookingGlassPolyfillOptions);
    }
}
