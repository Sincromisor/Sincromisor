import { bootstrapSincroPageAppShell } from "../react/appShell/bootstrapSincroPageAppShell";

// looking-glass-vrm でも app shell は共通化し、LG 専用設定だけを page panel に残す。
bootstrapSincroPageAppShell(
    () => import("../react/lookingGlassVrm/lookingGlassVrmControlPanel"),
    (module) => <module.LookingGlassVrmControlPanel />,
);
