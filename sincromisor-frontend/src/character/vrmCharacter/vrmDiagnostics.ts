import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroPoseRetargetFrame } from "../retargeting/sincroPoseRetargeter";
import type { SincroMotionComposerDryRunSummary } from "../runtime/sincroMotionObserveOnlyPipeline";
import type { SincroVrmPoseComposerResult } from "../runtime/sincroVrmPoseComposer";

/** 描画側から読込結果と同一フレームの診断を返す。省略時も計算・適用は継続し、保存用の複製は受信側が担う。 */
export type VRMDiagnostics = {
    onEmotionLog?: (message: string) => void;
    onAvatarMotionProfile?: (profile: MinimalAvatarMotionProfile | undefined) => void;
    onPoseRetargetFrame?: (frame: SincroPoseRetargetFrame) => void;
    onComposerSummary?: (summary: SincroMotionComposerDryRunSummary) => void;
    onComposerResult?: (result: SincroVrmPoseComposerResult) => void;
};
