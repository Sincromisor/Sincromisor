import type { ReactNode } from "react";
import "./overlay.css";

type StartupDialogFrameProps = {
    popLayer: ReactNode;
    children: ReactNode;
};

// 起動前 native dialog の内側 chrome を所有する frame component。
// ConfigurationDialog は HTMLDialogElement 境界に専念し、surface / scroll / pop layer はここへ集約する。
export function StartupDialogFrame({ popLayer, children }: StartupDialogFrameProps) {
    return (
        <div className="startupDialogFrame">
            <div className="startupDialogFrame__popLayer configurationDialogReactPopLayer">
                {popLayer}
            </div>
            <div id="sincroDialogReactSettingsRoot" className="startupDialogFrame__settingsRoot">
                {children}
            </div>
        </div>
    );
}
