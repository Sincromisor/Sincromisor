/** 体幹と腕が共有する元のワールド座標。部位別のnormalized値は原点が異なるため読まない。 */
import type { SincroPoseTargetPointSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CanonicalTuple3 } from "./canonicalUpperBodyState";

/** MediaPipeの右・下・奥向きを、解剖学的な右・上・前向きへ変換する。旧記録の欠損は補間しない。 */
export function readCanonicalWorldPoint(
    target: SincroPoseTargetPointSnapshot,
): CanonicalTuple3 | undefined {
    const { rawX, rawY, rawZ } = target.world;
    if (![rawX, rawY, rawZ].every((value) => typeof value === "number" && Number.isFinite(value)))
        return undefined;
    return [-(rawX as number), -(rawY as number), -(rawZ as number)];
}
