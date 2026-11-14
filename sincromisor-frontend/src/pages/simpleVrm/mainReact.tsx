import { bootstrapSincroPageAppShell } from "../../app/shell/bootstrapSincroPageAppShell";
import { initializeSimpleVrmPage } from "./mainVrm";

// 通常ページの設定入口を渡し、取得は共通画面で初めて設定を開くまで遅らせる。
bootstrapSincroPageAppShell(
    () => import("../../app/settings/react/sincroControlPanel"),
    (module) => <module.SincroControlPanel />,
    initializeSimpleVrmPage,
);
