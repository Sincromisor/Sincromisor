import type { DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import {
    formatHeadPose,
    formatInference,
    formatRatio,
    formatTrackerRuntime,
    formatTrackingStatus,
    formatUpdatedAt,
} from "./sincroMotionPanelFormatters";

const FACE_BLENDSHAPE_KEYS = [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "jawOpen",
    "mouthSmileLeft",
    "mouthSmileRight",
    "mouthFunnel",
    "mouthPucker",
];

type SincroMotionFaceSectionProps = {
    face: DebugConsoleSnapshot["sincroMotion"]["face"];
    tracker: DebugConsoleSnapshot["sincroMotion"]["tracker"];
};

/** 顔観測の診断表示。有効性と表情の強さを別々に示す。 */
export function SincroMotionFaceSection({ face, tracker }: SincroMotionFaceSectionProps) {
    return (
        <article className="sincroMotionSection">
            <h4>Face</h4>
            <dl className="gazeTable">
                <dt>Runtime</dt>
                <dd>{formatTrackerRuntime(tracker)}</dd>
                <dt>Status</dt>
                <dd>
                    {formatTrackingStatus(face.trackingEnabled, face.detected, face.fallbackReason)}
                </dd>
                <dt>入力の有効性</dt>
                <dd>{formatRatio(face.confidence)}</dd>
                <dt>Head</dt>
                <dd>{formatHeadPose(face)}</dd>
                <dt>Inference</dt>
                <dd>{formatInference(face.inferenceTimeMs, face.inferenceFps)}</dd>
                <dt>Updated</dt>
                <dd>{formatUpdatedAt(face.lastUpdatedAtMs)}</dd>
            </dl>
            <div className="sincroBlendshapeGrid">
                {FACE_BLENDSHAPE_KEYS.map((key) => (
                    <div className="sincroBlendshapeMeter" key={key}>
                        <span>{key}</span>
                        <meter min={0} max={1} value={face.blendshapes[key] ?? 0}></meter>
                        <strong>{formatRatio(face.blendshapes[key] ?? 0)}</strong>
                    </div>
                ))}
            </div>
        </article>
    );
}
