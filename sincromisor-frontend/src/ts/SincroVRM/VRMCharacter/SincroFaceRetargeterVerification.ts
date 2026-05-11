import {
    DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
    retargetSincroFaceExpressions,
    retargetSincroFaceHeadPose,
} from "./SincroFaceRetargeter";
import type { SincroFaceMotionSnapshot } from "../../FaceTracking/SincroFaceMotionSnapshot";

type SincroFaceRetargeterVerificationCase = {
    name: string;
    snapshot: SincroFaceMotionSnapshot;
    expected: {
        headYawSign: -1 | 0 | 1;
        headPitchSign: -1 | 0 | 1;
        headRollSign: -1 | 0 | 1;
        dominantMouth: "aa" | "ih" | "ou" | "ee" | "oh" | "none";
        blinkActive: boolean;
    };
};

const BASE_SNAPSHOT: SincroFaceMotionSnapshot = {
    trackingEnabled: true,
    detected: true,
    confidence: 1,
    headPose: {
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        matrix: null,
    },
    blendshapes: {},
    inferenceTimeMs: 0,
    inferenceFps: 15,
    lastUpdatedAtMs: 0,
    fallbackReason: null,
};

// Vitest 等の導入前でも、固定 snapshot の期待値を型付きの実行可能データとして残す。
// Debug Console や一時スクリプトから evaluateSincroFaceRetargeterVerificationCases() を呼ぶと検証できる。
export const SINCRO_FACE_RETARGETER_VERIFICATION_CASES: SincroFaceRetargeterVerificationCase[] = [
    {
        name: "positive yaw follows model right without mirror",
        snapshot: {
            ...BASE_SNAPSHOT,
            headPose: { ...BASE_SNAPSHOT.headPose, yawDeg: 16 },
        },
        expected: {
            headYawSign: 1,
            headPitchSign: 0,
            headRollSign: 0,
            dominantMouth: "none",
            blinkActive: false,
        },
    },
    {
        name: "neutral calibration removes resting head pose",
        snapshot: {
            ...BASE_SNAPSHOT,
            headPose: { ...BASE_SNAPSHOT.headPose, yawDeg: 8, pitchDeg: -5, rollDeg: 4 },
        },
        expected: {
            headYawSign: 0,
            headPitchSign: 0,
            headRollSign: 0,
            dominantMouth: "none",
            blinkActive: false,
        },
    },
    {
        name: "jaw open maps to aa",
        snapshot: {
            ...BASE_SNAPSHOT,
            blendshapes: { jawOpen: 0.82 },
        },
        expected: {
            headYawSign: 0,
            headPitchSign: 0,
            headRollSign: 0,
            dominantMouth: "aa",
            blinkActive: false,
        },
    },
    {
        name: "funnel maps to oh or ou and blink stays active",
        snapshot: {
            ...BASE_SNAPSHOT,
            blendshapes: { jawOpen: 0.42, mouthFunnel: 0.9, eyeBlinkLeft: 0.76, eyeBlinkRight: 0.73 },
        },
        expected: {
            headYawSign: 0,
            headPitchSign: 0,
            headRollSign: 0,
            dominantMouth: "oh",
            blinkActive: true,
        },
    },
];

export function evaluateSincroFaceRetargeterVerificationCases(): { name: string; passed: boolean }[] {
    return SINCRO_FACE_RETARGETER_VERIFICATION_CASES.map((testCase) => {
        const neutralPose = testCase.name.includes("neutral calibration")
            ? testCase.snapshot.headPose
            : BASE_SNAPSHOT.headPose;
        const head = retargetSincroFaceHeadPose(testCase.snapshot, neutralPose, DEFAULT_SINCRO_FACE_RETARGET_CONFIG);
        const expressions = retargetSincroFaceExpressions(testCase.snapshot.blendshapes);
        const dominantMouth = dominantMouthExpression(expressions);
        const passed = sign(head.neck.y) === testCase.expected.headYawSign
            && sign(head.neck.x) === testCase.expected.headPitchSign
            && sign(head.neck.z) === testCase.expected.headRollSign
            && dominantMouth === testCase.expected.dominantMouth
            && (expressions.blink > 0.5) === testCase.expected.blinkActive;
        return { name: testCase.name, passed };
    });
}

function dominantMouthExpression(expressions: ReturnType<typeof retargetSincroFaceExpressions>): SincroFaceRetargeterVerificationCase["expected"]["dominantMouth"] {
    const mouthValues = {
        aa: expressions.aa,
        ih: expressions.ih,
        ou: expressions.ou,
        ee: expressions.ee,
        oh: expressions.oh,
    };
    const [name, value] = Object.entries(mouthValues)
        .sort((left, right) => right[1] - left[1])[0] ?? ["none", 0];
    return value > 0 ? name as SincroFaceRetargeterVerificationCase["expected"]["dominantMouth"] : "none";
}

function sign(value: number): -1 | 0 | 1 {
    if (Math.abs(value) < 1e-6) {
        return 0;
    }
    return value > 0 ? 1 : -1;
}
