import { bootstrapSincroPageAppShell } from "../../app/shell/bootstrapSincroPageAppShell";
import { initializeLookingGlassVrmPage } from "./mainVrmLookingGlass";

// looking-glass-vrm でも app shell は共通化し、LG 専用設定だけを page panel に残す。
bootstrapSincroPageAppShell(
    () => import("./react/lookingGlassVrmControlPanel"),
    (module) => <module.LookingGlassVrmControlPanel />,
    initializeLookingGlassVrmPage,
);
