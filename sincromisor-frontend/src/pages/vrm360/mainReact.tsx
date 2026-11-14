import { bootstrapSincroPageAppShell } from "../../app/shell/bootstrapSincroPageAppShell";
import { initializeVrm360Page } from "./mainVrm360";

// 360度用の設定入口と初期化処理を共通画面へ渡す。設定の取得は初回表示時に行う。
bootstrapSincroPageAppShell(
    () => import("./react/vrm360ControlPanel"),
    (module) => <module.Vrm360ControlPanel />,
    initializeVrm360Page,
);
