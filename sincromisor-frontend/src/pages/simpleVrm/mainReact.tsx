import { bootstrapSincroPageAppShell } from "../../app/shell/bootstrapSincroPageAppShell";
import { initializeSimpleVrmPage } from "./mainVrm";

// simple-vrm では page 全体の UI shell を単一 React root で起動する。
bootstrapSincroPageAppShell(
    () => import("./react/simpleVrmControlPanel"),
    (module) => <module.SimpleVrmControlPanel />,
    initializeSimpleVrmPage,
);
