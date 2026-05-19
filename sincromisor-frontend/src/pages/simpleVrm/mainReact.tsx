import { bootstrapSincroPageAppShell } from "../../react/appShell/bootstrapSincroPageAppShell";

// simple-vrm では page 全体の UI shell を単一 React root で起動する。
bootstrapSincroPageAppShell(
    () => import("../../react/simpleVrm/simpleVrmControlPanel"),
    (module) => <module.SimpleVrmControlPanel />,
);
