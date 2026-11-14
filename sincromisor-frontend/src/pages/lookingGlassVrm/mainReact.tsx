import { bootstrapSincroPageAppShell } from "../../app/shell/bootstrapSincroPageAppShell";
import { initializeLookingGlassVrmPage } from "./mainVrmLookingGlass";

// Looking Glass用の設定入口と初期化処理を共通画面へ渡す。設定の取得は初回表示時に行う。
bootstrapSincroPageAppShell(
    () => import("./react/lookingGlassVrmControlPanel"),
    (module) => <module.LookingGlassVrmControlPanel />,
    initializeLookingGlassVrmPage,
);
