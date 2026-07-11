import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityScore,
} from "../../../../features/gaze/trackingRuntime/cameraQualityScore";
import { CameraQualityGuideCard } from "../components/diagnosticsStatusCards";
import { createPanelCameraGuideState, reducePanelCameraGuideState } from "../panelCameraGuideState";

function createQuality(
    status: CameraQualityScore["overall"]["status"],
    message?: string,
): CameraQualityScore {
    const component = { score: 1, status: "good" as const, reasonCodes: [] };
    return {
        schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
        overall: { score: status === "good" ? 1 : 0.5, status },
        components: {
            resolution: component,
            cadence: component,
            torsoInFrame: component,
            handsInFrame: component,
            borderRisk: component,
            handSmallRisk: component,
            motionBlurRisk: component,
        },
        reasons: message === undefined ? [] : ["low_resolution"],
        guideMessages:
            message === undefined
                ? []
                : [
                      {
                          code: "low_resolution",
                          text: message,
                          severity: status === "bad" ? "bad" : "warn",
                      },
                  ],
        track: {},
        sample: {
            videoWidth: 1280,
            videoHeight: 720,
            poseDetected: true,
            poseConfidence: 0.9,
        },
    };
}

describe("panel camera guide state", () => {
    it("shows bad immediately and requires 500 ms for initial warn", () => {
        const initial = createPanelCameraGuideState();
        const bad = reducePanelCameraGuideState(initial, createQuality("bad", "明るくする"), 100);
        expect(bad.message).toBe("明るくする");

        const warnPending = reducePanelCameraGuideState(
            createPanelCameraGuideState(),
            createQuality("warn", "少し下がる"),
            100,
        );
        expect(warnPending.message).toBeUndefined();
        expect(
            reducePanelCameraGuideState(warnPending, createQuality("warn", "少し下がる"), 599)
                .message,
        ).toBeUndefined();
        expect(
            reducePanelCameraGuideState(warnPending, createQuality("warn", "少し下がる"), 600)
                .message,
        ).toBe("少し下がる");
    });

    it("holds a visible message for 1000 ms and requires a stable replacement", () => {
        const shown = reducePanelCameraGuideState(
            createPanelCameraGuideState(),
            createQuality("bad", "明るくする"),
            100,
        );
        const candidate = reducePanelCameraGuideState(
            shown,
            createQuality("bad", "少し下がる"),
            500,
        );
        expect(
            reducePanelCameraGuideState(candidate, createQuality("bad", "少し下がる"), 1_000)
                .message,
        ).toBe("明るくする");
        expect(
            reducePanelCameraGuideState(candidate, createQuality("bad", "少し下がる"), 1_100)
                .message,
        ).toBe("少し下がる");
    });

    it("hides immediately for good, missing messages, reset, and chat-mode reset", () => {
        const shown = reducePanelCameraGuideState(
            createPanelCameraGuideState(),
            createQuality("bad", "明るくする"),
            100,
        );
        expect(
            reducePanelCameraGuideState(shown, createQuality("good"), 101).message,
        ).toBeUndefined();
        expect(
            reducePanelCameraGuideState(shown, createQuality("warn"), 101).message,
        ).toBeUndefined();
        expect(createPanelCameraGuideState().message).toBeUndefined();
        // talk mode 離脱は production owner が camera-quality-reset を発火し、同じ初期 state に戻す。
        expect(createPanelCameraGuideState()).toEqual(createPanelCameraGuideState());
    });

    it("discards a candidate on clock regression without hiding the visible guide", () => {
        const shown = reducePanelCameraGuideState(
            createPanelCameraGuideState(),
            createQuality("bad", "明るくする"),
            1_000,
        );
        const pending = reducePanelCameraGuideState(
            shown,
            createQuality("warn", "少し下がる"),
            1_200,
        );
        const regressed = reducePanelCameraGuideState(
            pending,
            createQuality("warn", "少し下がる"),
            1_100,
        );
        expect(regressed.message).toBe("明るくする");
        expect(regressed.candidate).toBeUndefined();
        expect(regressed.lastObservedAtMs).toBe(1_200);
    });

    it("renders only the guide text and hides an empty state", () => {
        const state = reducePanelCameraGuideState(
            createPanelCameraGuideState(),
            createQuality("bad", "明るくする"),
            100,
        );
        const markup = renderToStaticMarkup(<CameraQualityGuideCard state={state} />);
        expect(markup).toContain("明るくする");
        expect(markup).not.toContain("low_resolution");
        expect(
            renderToStaticMarkup(<CameraQualityGuideCard state={createPanelCameraGuideState()} />),
        ).toBe("");
    });
});
