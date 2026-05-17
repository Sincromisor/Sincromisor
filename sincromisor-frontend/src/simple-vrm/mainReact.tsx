import { bootstrapSincroPageAppShell } from "../react/app-shell/bootstrapSincroPageAppShell";

// simple-vrm では page 全体の UI shell を単一 React root で起動する。
bootstrapSincroPageAppShell(
    () => import("../react/simple-vrm/SimpleVrmControlPanel"),
    (module) => <module.SimpleVrmControlPanel />,
);
