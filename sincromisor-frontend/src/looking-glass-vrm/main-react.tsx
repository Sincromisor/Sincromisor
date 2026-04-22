import { bootstrapSincroPageAppShell } from "../react/app-shell/bootstrapSincroPageAppShell";

// looking-glass-vrm でも app shell は共通化し、LG 専用設定だけを page panel に残す。
bootstrapSincroPageAppShell(
    () => import("../react/looking-glass-vrm/LookingGlassVrmControlPanel"),
    (module) => <module.LookingGlassVrmControlPanel />,
);
