export type DebugTabKey = "status" | "audio" | "messages" | "gaze" | "rtc" | "sdp";

export type DebugPanelProps = {
    isActive: boolean;
};

export function debugPanelClassName(baseClassName: string, isActive: boolean): string {
    return `${baseClassName} debugPanel${isActive ? " is-active" : ""}`;
}
