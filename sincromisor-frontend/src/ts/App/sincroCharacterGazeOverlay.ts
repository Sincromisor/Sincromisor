import type { Detection } from "@mediapipe/tasks-vision";
import type { CharacterGaze } from "../CharacterGaze/CharacterGaze";

export function hideEyeTargetOverlay(): void {
    const eyeTargetElement = document.querySelector("#eyeTarget");
    eyeTargetElement?.setAttribute("fill", "hsl(300 100% 50% / 0%)");
}

export function resolveTrackingVideoElement(): HTMLVideoElement {
    const trackingVideo = document.querySelector<HTMLVideoElement>("video#characterGazeVideo");
    if (!trackingVideo) {
        throw new Error("video#characterGazeVideo is not found.");
    }
    return trackingVideo;
}

export function updateEyeTargetOverlay(
    characterGaze: CharacterGaze,
    gazeEnabled: boolean,
    detects: Detection[],
): void {
    // 既存 SVG オーバーレイ表示。React へ移しきるまで DOM 更新を小さな境界に閉じ込める。
    const eyeTargetElement = document.querySelector("#eyeTarget");
    if (!eyeTargetElement) {
        return;
    }
    if (gazeEnabled && detects.length > 0) {
        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
        eyeTargetElement.setAttribute("cx", `${characterGaze.targetX() * 100}%`);
        eyeTargetElement.setAttribute("cy", `${characterGaze.targetY() * 100}%`);
        return;
    }
    eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 0%)");
}
