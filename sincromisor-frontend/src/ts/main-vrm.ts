import { SincroVRMInitializer } from "./SincroVRM/SincroVRMInitializer";

// modern VRM 系ページ（simple-vrm）の最小エントリ。
// HTML から最初に読み込まれ、起動判断やUI配線の本体は SincroVRMInitializer へ委譲する。
window.addEventListener('load', () => {
    void SincroVRMInitializer.bootstrap().catch((error) => {
        console.error('Failed to bootstrap simple-vrm page.', error);
    });
});
