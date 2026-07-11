/**
 * motion-debug の live estimator 出力を production character runtime の現在値へ合流する。
 *
 * recording / viewer だけに temporal state を保存すると、同じ fixture frame の production retarget は
 * `temporal_input_missing` で Pose fallback へ落ちる。既存 pipeline の intent 等は維持しつつ、tracker
 * 入力と temporal / reliability は現在 frame の値で必ず上書きする。Hand が消失した frame では
 * `undefined` を明示して stale Hand を残さない。
 */
import type { SincroMotionPipelineState } from "../../character/runtime/sincroMotionPipelineState";

export type MotionDebugBehaviorPipelineFrame = Pick<
    SincroMotionPipelineState,
    "face" | "pose" | "hand" | "reliability" | "temporal" | "updatedAtMs"
>;

export function mergeMotionDebugBehaviorPipelineFrame(
    current: SincroMotionPipelineState | undefined,
    frame: MotionDebugBehaviorPipelineFrame,
): SincroMotionPipelineState {
    return {
        ...current,
        ...frame,
    };
}
