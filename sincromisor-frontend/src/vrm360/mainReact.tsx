import { bootstrapSincroPageAppShell } from "../react/app-shell/bootstrapSincroPageAppShell";

// vrm360 でも UI 起動経路を simple-vrm と揃え、scene 差分だけを page panel に閉じる。
bootstrapSincroPageAppShell(
    () => import("../react/vrm360/Vrm360ControlPanel"),
    (module) => <module.Vrm360ControlPanel />,
);
