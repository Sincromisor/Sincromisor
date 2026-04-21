import { SincroInitializer } from "./SincroLegacy/SincroInitializer";

// Babylon legacy ページ群（simple / single / double など）の共有エントリ。
// modern 側と同じく、ここでは legacy initializer を起動するだけに留める。
window.addEventListener('load', () => {
    new SincroInitializer();
});
