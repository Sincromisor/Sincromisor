import type { VRM } from "@pixiv/three-vrm";
import { Box3 } from "three/src/math/Box3.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { VRMCamera } from "../VRMScene/VRMCamera";

const SIMPLE_VRM_AUTO_FRAMING_TARGET = {
    // neck が無いVRMで neck位置を head/chest から推定する比率（0=chest, 1=head）。
    neckFallbackFromChestToHead: 0.72,
    // head ボーンから頭頂を推定する倍率。値を上げると頭頂の推定が高くなり、切れにくいが引きやすい。
    estimatedHeadTopFromHeadNeckSpan: 0.65,
    // 胸の少し下までフレームに含める量（head-chest差に対する比率）。
    bottomOverscanBelowChestRatio: 0.12,
    // ahoge などの突起による bbox 上端の上振れをどこまで許容するか（head-neck差に対する比率）。
    maxTopOvershootFromHeadTopRatio: 0.45,
    // eyeCenter -> neck の補間率。0 に近いほど目寄り、1 に近いほど首寄り。
    eyeCenterTowardNeckRatio: 0.1,
    // eye ボーンが無いVRMで neck->head から顔ターゲットを作る比率（0=neck, 1=head）。
    faceAimFallbackFromNeckToHead: 0.88,
} as const;

const SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK = {
    // bbox だけで胸位置を推定する比率（0=足元, 1=頭頂）。
    estimatedChestHeightRatio: 0.58,
    // bbox胸推定より少し下まで含める量（全身高に対する比率）。
    chestBottomOverscanRatio: 0.04,
    // bbox フォールバック時の顔ターゲット位置（bottom=0, top=1）。
    faceAimHeightRatio: 0.66,
} as const;

export function applyInitialUpperBodyFraming(vrm: VRM, vrmCamera: VRMCamera): void {
    vrm.scene.updateMatrixWorld(true);
    const bbox = new Box3().setFromObject(vrm.scene);
    const bonePositions = getUpperBodyBonePositions(vrm);

    if (bonePositions.head && bonePositions.chestBase) {
        applyHumanoidUpperBodyFraming({
            vrmCamera,
            bbox,
            ...bonePositions,
            head: bonePositions.head,
            chestBase: bonePositions.chestBase,
        });
        return;
    }
    applyBoundingBoxUpperBodyFraming(vrmCamera, bbox);
}

function getUpperBodyBonePositions(vrm: VRM) {
    const head = getHumanoidBoneWorldPosition(vrm, "head");
    const upperChest = getHumanoidBoneWorldPosition(vrm, "upperChest");
    const chest = getHumanoidBoneWorldPosition(vrm, "chest");
    const spine = getHumanoidBoneWorldPosition(vrm, "spine");
    return {
        head,
        neck: getHumanoidBoneWorldPosition(vrm, "neck"),
        leftEye: getHumanoidBoneWorldPosition(vrm, "leftEye"),
        rightEye: getHumanoidBoneWorldPosition(vrm, "rightEye"),
        chestBase: upperChest ?? chest ?? spine,
    };
}

type HumanoidUpperBodyFramingOptions = ReturnType<typeof getUpperBodyBonePositions> & {
    vrmCamera: VRMCamera;
    bbox: Box3;
    head: Vector3;
    chestBase: Vector3;
};

function applyHumanoidUpperBodyFraming({
    vrmCamera,
    bbox,
    head,
    neck,
    leftEye,
    rightEye,
    chestBase,
}: HumanoidUpperBodyFramingOptions): void {
    const neckReference = createNeckReference(head, chestBase, neck);
    const headToNeck = Math.max(head.y - neckReference.y, 0.06);
    const estimatedHeadTopY =
        head.y + headToNeck * SIMPLE_VRM_AUTO_FRAMING_TARGET.estimatedHeadTopFromHeadNeckSpan;
    const frameBottomY =
        chestBase.y -
        Math.max(head.y - chestBase.y, 0.2) *
            SIMPLE_VRM_AUTO_FRAMING_TARGET.bottomOverscanBelowChestRatio;
    const maxTopOvershoot =
        headToNeck * SIMPLE_VRM_AUTO_FRAMING_TARGET.maxTopOvershootFromHeadTopRatio;
    const frameTopY = bbox.isEmpty()
        ? estimatedHeadTopY
        : Math.min(Math.max(estimatedHeadTopY, bbox.max.y), estimatedHeadTopY + maxTopOvershoot);
    const target = createFaceAimTarget({
        head,
        neckReference,
        leftEye,
        rightEye,
    });
    vrmCamera.frameVerticalRange(target, frameTopY, frameBottomY);
}

function createNeckReference(head: Vector3, chestBase: Vector3, neck?: Vector3): Vector3 {
    return (
        neck ??
        chestBase.clone().lerp(head, SIMPLE_VRM_AUTO_FRAMING_TARGET.neckFallbackFromChestToHead)
    );
}

function createFaceAimTarget({
    head,
    neckReference,
    leftEye,
    rightEye,
}: {
    head: Vector3;
    neckReference: Vector3;
    leftEye?: Vector3;
    rightEye?: Vector3;
}): Vector3 {
    const eyeCenter =
        leftEye && rightEye ? leftEye.clone().add(rightEye).multiplyScalar(0.5) : undefined;
    const faceAim = eyeCenter
        ? eyeCenter
              .clone()
              .lerp(neckReference, SIMPLE_VRM_AUTO_FRAMING_TARGET.eyeCenterTowardNeckRatio)
        : neckReference
              .clone()
              .lerp(head, SIMPLE_VRM_AUTO_FRAMING_TARGET.faceAimFallbackFromNeckToHead);
    return new Vector3(faceAim.x, faceAim.y, faceAim.z);
}

function applyBoundingBoxUpperBodyFraming(vrmCamera: VRMCamera, bbox: Box3): void {
    if (bbox.isEmpty()) {
        return;
    }
    const size = bbox.getSize(new Vector3());
    const center = bbox.getCenter(new Vector3());
    const topY = bbox.max.y;
    const estimatedChestY =
        bbox.min.y + size.y * SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK.estimatedChestHeightRatio;
    const frameBottomY =
        estimatedChestY - size.y * SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK.chestBottomOverscanRatio;
    const verticalSpan = Math.max(topY - frameBottomY, 0.3);
    const target = new Vector3(
        center.x,
        frameBottomY + verticalSpan * SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK.faceAimHeightRatio,
        center.z,
    );
    vrmCamera.frameVerticalRange(target, topY, frameBottomY);
}

function getHumanoidBoneWorldPosition(
    vrm: VRM,
    boneName: "head" | "neck" | "leftEye" | "rightEye" | "upperChest" | "chest" | "spine",
): Vector3 | undefined {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!node) {
        return undefined;
    }
    return node.getWorldPosition(new Vector3());
}
