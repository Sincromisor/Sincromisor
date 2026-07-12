import type { InitialCalibrationStepId } from "../../../../character/calibration/initialSincroCalibration";
import type { InitialSincroCalibrationControllerState } from "../../../../character/calibration/initialSincroCalibrationController";

export type InitialCalibrationRetryCardProps = {
    state: InitialSincroCalibrationControllerState;
    onRetry: (stepId: InitialCalibrationStepId) => void;
};

/**
 * Initial calibration の current step と既存 session summary を settings UI に表示する。
 *
 * ready / ready_without_hands でも明示操作なら再試行できる。未記録 step、idle、cancelled は action を
 * 表示せず、session guard と cascade は controller に委譲する。
 */
export function InitialCalibrationRetryCard({ state, onRetry }: InitialCalibrationRetryCardProps) {
    if (state.status !== "active") {
        return null;
    }
    const step = state.session.steps[state.currentStep];
    const guide = state.session.userGuideMessages[0];
    return (
        <div className="settingsPrimitiveSectionBlock">
            <div>調整ステップ: {stepLabel(state.currentStep)}</div>
            <div>状態: {state.session.status}</div>
            {guide === undefined ? null : <div>{guide}</div>}
            {step === undefined ? null : (
                <button type="button" onClick={() => onRetry(state.currentStep)}>
                    再試行
                </button>
            )}
        </div>
    );
}

function stepLabel(stepId: InitialCalibrationStepId): string {
    switch (stepId) {
        case "precheck":
            return "事前確認";
        case "neutral":
            return "正面姿勢";
        case "a_pose":
            return "腕の姿勢";
        case "hand_open":
            return "手を開く";
        case "face_yaw_optional":
            return "顔の向き";
    }
}
