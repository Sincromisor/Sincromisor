/**
 * camera preview 上へ Sincro pose target overlay を描画する renderer。
 * 座標は normalized pose snapshot から canvas pixel へ写すだけで、retarget / IK / reliability 判定は行わない。
 */
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { MotionDebugPoseTarget } from "./types";

const TARGET_CONNECTIONS = [
    ["left shoulder", "right shoulder"],
    ["left shoulder", "left elbow"],
    ["left elbow", "left wrist"],
    ["right shoulder", "right elbow"],
    ["right elbow", "right wrist"],
    ["left shoulder", "left hip"],
    ["right shoulder", "right hip"],
    ["left hip", "right hip"],
] as const;

// MediaPipe の生 landmark ではなく、本番 retarget に入る SincroPoseMotionSnapshot を描く。
// IK 調整時に「solver が実際に見ている target」を確認できるようにするため。
export class MotionDebugPoseOverlayRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("2D canvas context is not available.");
        }
        this.canvas = canvas;
        this.context = context;
    }

    render(snapshot: SincroPoseMotionSnapshot, video: HTMLVideoElement): void {
        this.syncCanvasSize(video);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!snapshot.detected) {
            return;
        }

        const targets = this.poseTargets(snapshot);
        this.context.lineWidth = 3;
        this.context.strokeStyle = "rgba(82, 182, 154, 0.9)";
        this.context.fillStyle = "rgba(255, 205, 86, 0.95)";
        this.context.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        for (const [startName, endName] of TARGET_CONNECTIONS) {
            this.drawConnection(targets, startName, endName);
        }
        for (const target of targets) {
            this.drawTarget(target);
        }
    }

    private syncCanvasSize(video: HTMLVideoElement): void {
        const width = positiveDimensionOrDefault(video.videoWidth, video.clientWidth, 2);
        const height = positiveDimensionOrDefault(video.videoHeight, video.clientHeight, 2);
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }

    private poseTargets(snapshot: SincroPoseMotionSnapshot): MotionDebugPoseTarget[] {
        return [
            { name: "left shoulder", point: snapshot.leftArm.targets.shoulder },
            { name: "left elbow", point: snapshot.leftArm.targets.elbow },
            { name: "left wrist", point: snapshot.leftArm.targets.wrist },
            { name: "right shoulder", point: snapshot.rightArm.targets.shoulder },
            { name: "right elbow", point: snapshot.rightArm.targets.elbow },
            { name: "right wrist", point: snapshot.rightArm.targets.wrist },
            { name: "left hip", point: snapshot.lowerBodyTargets.leftHip },
            { name: "right hip", point: snapshot.lowerBodyTargets.rightHip },
        ];
    }

    private drawConnection(
        targets: MotionDebugPoseTarget[],
        startName: string,
        endName: string,
    ): void {
        const start = targets.find((target) => target.name === startName)?.point;
        const end = targets.find((target) => target.name === endName)?.point;
        if (!start?.tracked || !end?.tracked) {
            return;
        }
        this.context.beginPath();
        this.context.moveTo(start.cameraX * this.canvas.width, start.cameraY * this.canvas.height);
        this.context.lineTo(end.cameraX * this.canvas.width, end.cameraY * this.canvas.height);
        this.context.stroke();
    }

    private drawTarget(target: MotionDebugPoseTarget): void {
        if (!target.point.tracked) {
            return;
        }
        const x = target.point.cameraX * this.canvas.width;
        const y = target.point.cameraY * this.canvas.height;
        const radius = target.point.quality === "strong" ? 5 : 3;
        this.context.beginPath();
        this.context.arc(x, y, radius, 0, Math.PI * 2);
        this.context.fill();
        this.context.fillText(target.name, x + 8, y - 8);
    }
}

function positiveDimensionOrDefault(...values: number[]): number {
    return values.find((value) => value > 0) ?? 2;
}
