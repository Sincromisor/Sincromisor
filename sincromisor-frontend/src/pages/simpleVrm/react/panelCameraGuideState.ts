import type { CameraQualityScore } from "../../../features/gaze/trackingRuntime/cameraQualityScore";

const CAMERA_GUIDE_CANDIDATE_MS = 500;
const CAMERA_GUIDE_VISIBLE_HOLD_MS = 1_000;

type PanelCameraGuideCandidate = {
    message: string;
    status: "warn" | "bad";
    sinceMs: number;
};

/**
 * Camera guide の表示に必要な最小 state。
 *
 * score や reason code は保持せず、一般 UI に開発者向け診断値が混入しない境界を作る。
 * 時刻は event payload の観測時刻だけを使い、render 時刻や timer には依存しない。
 */
export type PanelCameraGuideState = {
    message: string | undefined;
    status: "warn" | "bad" | undefined;
    displayedSinceMs: number | undefined;
    candidate: PanelCameraGuideCandidate | undefined;
    lastObservedAtMs: number | undefined;
};

/** Camera guide の初期状態と reset 後の非表示状態を返す。 */
export function createPanelCameraGuideState(): PanelCameraGuideState {
    return {
        message: undefined,
        status: undefined,
        displayedSinceMs: undefined,
        candidate: undefined,
        lastObservedAtMs: undefined,
    };
}

/**
 * CameraQualityScore の先頭 guide だけを表示 state へ還元する。
 *
 * bad の初回表示だけは即時とし、warn と表示中の差し替えには candidate 継続時間を要求する。
 * 観測時刻が逆行した event は現在表示を維持しつつ候補だけを破棄し、古い frame による遅延切替を防ぐ。
 */
export function reducePanelCameraGuideState(
    state: PanelCameraGuideState,
    quality: CameraQualityScore,
    observedAtMs: number,
): PanelCameraGuideState {
    if (state.lastObservedAtMs !== undefined && observedAtMs < state.lastObservedAtMs) {
        return { ...state, candidate: undefined };
    }

    const message = quality.guideMessages[0]?.text;
    const status = quality.overall.status;
    if (message === undefined || status === "good") {
        return { ...createPanelCameraGuideState(), lastObservedAtMs: observedAtMs };
    }

    if (state.message === undefined && status === "bad") {
        return {
            message,
            status,
            displayedSinceMs: observedAtMs,
            candidate: undefined,
            lastObservedAtMs: observedAtMs,
        };
    }

    if (state.message === message && state.status === status) {
        return { ...state, candidate: undefined, lastObservedAtMs: observedAtMs };
    }

    const candidate =
        state.candidate?.message === message && state.candidate.status === status
            ? state.candidate
            : { message, status, sinceMs: observedAtMs };
    const candidateReady = observedAtMs - candidate.sinceMs >= CAMERA_GUIDE_CANDIDATE_MS;
    const holdReady =
        state.displayedSinceMs === undefined ||
        observedAtMs - state.displayedSinceMs >= CAMERA_GUIDE_VISIBLE_HOLD_MS;

    if (candidateReady && holdReady) {
        return {
            message,
            status,
            displayedSinceMs: observedAtMs,
            candidate: undefined,
            lastObservedAtMs: observedAtMs,
        };
    }
    return { ...state, candidate, lastObservedAtMs: observedAtMs };
}
