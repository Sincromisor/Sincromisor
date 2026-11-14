import { VRMUtils } from "@pixiv/three-vrm";
import { Group, Scene } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { frontendLogger } from "../../../shared/logging/appLogger";
import type { VRMCamera } from "../../scene/vrmCamera";
import { VRMCharacterManager } from "../vrmCharacterManager";
import { createVrmModelRuntime } from "../vrmModelRuntime";

const requests = vi.hoisted(
    () =>
        [] as Array<{
            url: string;
            success: (gltf: GLTF) => void;
            failure: (error: Error) => void;
        }>,
);
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
    GLTFLoader: class {
        register() {}
        load(
            url: string,
            success: (gltf: GLTF) => void,
            _progress: unknown,
            failure: (error: Error) => void,
        ) {
            requests.push({ url, success, failure });
        }
    },
}));
vi.mock("../../behavior/characterBehaviorState", () => ({
    CharacterBehaviorState: { getManager: () => ({}) },
}));
vi.mock("../vrmModelRuntime", () => ({
    createVrmModelRuntime: vi.fn(({ vrm }) => ({
        vrm,
        headBoneController: { vrm },
        sincroPoseRetargeter: { getAvatarMotionProfile: () => undefined },
    })),
}));

beforeEach(() => {
    requests.length = 0;
    vi.spyOn(frontendLogger, "error").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "removeUnnecessaryVertices").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "combineSkeletons").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "combineMorphs").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "deepDispose").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
function model(name: string): GLTF {
    const scene = new Group();
    scene.name = name;
    return {
        scene,
        userData: { vrm: { scene, humanoid: {}, meta: { metaVersion: "1" } } },
    } as unknown as GLTF;
}
async function setup() {
    const scene = new Scene();
    const thumbnails = vi.fn();
    const manager = new VRMCharacterManager({
        scene,
        vrmCamera: {} as VRMCamera,
        vrmUrl: "A",
        onThumbnailLoaded: thumbnails,
    });
    const a = model("A");
    requests[0]?.success(a);
    await manager.ready;
    return { scene, manager, a, thumbnails };
}

it("同一モデルを再利用し、交換成功まで旧モデル・制御を保ち、その後だけ旧GPU資源を解放する", async () => {
    const { manager, scene, a, thumbnails } = await setup();
    const oldController = manager.headBoneController;
    const thumbnailIsCurrent = thumbnails.mock.calls[0]?.[1];
    await manager.replaceVrm("A");
    expect(requests).toHaveLength(1);
    expect(thumbnailIsCurrent()).toBe(true);
    const replacing = manager.replaceVrm("B");
    expect(manager.vrm).toBe(a.userData.vrm);
    expect(manager.headBoneController).toBe(oldController);
    expect(VRMUtils.deepDispose).not.toHaveBeenCalled();
    const b = model("B");
    requests[1]?.success(b);
    await replacing;
    expect(manager.vrm).toBe(b.userData.vrm);
    expect(manager.headBoneController).not.toBe(oldController);
    expect(scene.children).toEqual([b.scene]);
    expect(VRMUtils.deepDispose).toHaveBeenCalledExactlyOnceWith(a.scene);
    expect(thumbnailIsCurrent()).toBe(false);
});

it.each(["network", "controls", "thumbnail"])(
    "%s失敗でも旧モデル・旧制御を保ち、同じ選択を再試行できる",
    async (failure) => {
        const { manager, a, thumbnails } = await setup();
        const oldController = manager.headBoneController;
        const replacing = manager.replaceVrm("B");
        const b = model("B");
        if (failure === "network") requests[1]?.failure(new Error("network failed"));
        else {
            if (failure === "controls")
                vi.mocked(createVrmModelRuntime).mockImplementationOnce(() => {
                    throw new Error("controls failed");
                });
            if (failure === "thumbnail")
                thumbnails.mockImplementationOnce(() => {
                    throw new Error("thumbnail failed");
                });
            requests[1]?.success(b);
        }
        await expect(replacing).rejects.toThrow();
        expect(manager.vrm).toBe(a.userData.vrm);
        expect(manager.headBoneController).toBe(oldController);
        expect(VRMUtils.deepDispose).not.toHaveBeenCalledWith(a.scene);
        if (failure !== "network") expect(VRMUtils.deepDispose).toHaveBeenCalledWith(b.scene);
        const retry = manager.replaceVrm("B");
        requests[2]?.success(model("retry"));
        await retry;
        expect(manager.vrm?.scene.name).toBe("retry");
    },
);

it("BよりCが先に完了してもBを反映せず、不採用モデルを解放する", async () => {
    const { manager } = await setup();
    const b = model("B");
    const c = model("C");
    const pendingB = manager.replaceVrm("B");
    const rejectedB = expect(pendingB).rejects.toMatchObject({ name: "AbortError" });
    const pendingC = manager.replaceVrm("C");
    requests[2]?.success(c);
    await pendingC;
    requests[1]?.success(b);
    await rejectedB;
    expect(manager.vrm).toBe(c.userData.vrm);
    expect(VRMUtils.deepDispose).toHaveBeenCalledWith(b.scene);
});

it("B読込中に表示中Aへ戻すとBだけを取り消し、Aのサムネイルは有効に保つ", async () => {
    const { manager, a, thumbnails } = await setup();
    const thumbnailIsCurrent = thumbnails.mock.calls[0]?.[1];
    const b = model("B");
    const pendingB = manager.replaceVrm("B");
    const rejectedB = expect(pendingB).rejects.toMatchObject({ name: "AbortError" });
    await manager.replaceVrm("A");
    requests[1]?.success(b);
    await rejectedB;
    expect(manager.vrm).toBe(a.userData.vrm);
    expect(thumbnailIsCurrent()).toBe(true);
    expect(VRMUtils.deepDispose).toHaveBeenCalledExactlyOnceWith(b.scene);
});

it("停止・解除のAbortSignal後に届く候補も反映しない", async () => {
    const { manager, a } = await setup();
    const abort = new AbortController();
    const pending = manager.replaceVrm("B", abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    const b = model("B");
    requests[1]?.success(b);
    await rejected;
    expect(manager.vrm).toBe(a.userData.vrm);
    expect(VRMUtils.deepDispose).toHaveBeenCalledExactlyOnceWith(b.scene);
});
