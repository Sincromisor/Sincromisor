import { bootstrapSincroPageAppShell } from "../react/appShell/bootstrapSincroPageAppShell";

// vrm360 でも UI 起動経路を simple-vrm と揃え、scene 差分だけを page panel に閉じる。
bootstrapSincroPageAppShell(
    () => import("../react/vrm360/vrm360ControlPanel"),
    (module) => <module.Vrm360ControlPanel />,
);
