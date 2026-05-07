export type DebugTabKey = "status" | "audio" | "rtc" | "messages" | "gaze" | "raw";

export type DebugPanelProps = {
    isActive: boolean;
};

export function debugPanelClassName(baseClassName: string, isActive: boolean): string {
    return `${baseClassName} debugPanel${isActive ? " is-active" : ""}`;
}
