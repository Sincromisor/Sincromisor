import { SincroLookingGlassVRMInitializer } from "../ts/SincroVRM/SincroLookingGlassVRMInitializer";

// Looking Glass VRM ページ専用の最小エントリ。
// ページ差分は initializer 側へ閉じ、ここでは HTML からの起動経路だけを示す。
window.addEventListener('load', () => {
    void SincroLookingGlassVRMInitializer.bootstrap().catch((error) => {
        console.error('Failed to bootstrap looking-glass-vrm page.', error);
    });
});
