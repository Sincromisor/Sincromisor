import type { ReactNode } from "react";
import { meterPercent } from "./debugConsoleFormatters";

type AudioMeterProps = {
    id: string;
    label: string;
    level: number;
    children?: ReactNode;
};

export function AudioMeter({ id, label, level, children }: AudioMeterProps) {
    const clampedLevel = Math.max(0, Math.min(1, level));
    return (
        <div className="audioMeterPanel">
            <div className="audioMeterHeader">
                <span>{label}</span>
                <span>{meterPercent(level)}</span>
            </div>
            <div className="audioMeterTrack">
                <div id={id} className="audioMeterFill" style={{ width: `${clampedLevel * 100}%` }}></div>
            </div>
            {children}
        </div>
    );
}
