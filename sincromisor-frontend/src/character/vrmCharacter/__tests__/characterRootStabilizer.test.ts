import { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { expect, it } from "vitest";
import { CharacterRootStabilizer } from "../characterRootStabilizer";

it("腰の位置と初期回転だけを復元し、欠損ボーンでは何もしない", () => {
    const hips = new Object3D();
    const spine = new Object3D();
    hips.add(spine);
    hips.rotation.set(0.1, 0.2, 0.3);
    const initial = hips.rotation.clone();
    const stabilizer = new CharacterRootStabilizer(hips);
    hips.rotation.set(1, 2, 3);
    spine.rotation.set(0.4, 0.5, 0.6);
    const upperBody = spine.rotation.clone();
    const position = new Vector3(2, 3, 4);
    stabilizer.update(position);
    expect(hips.position.equals(position)).toBe(true);
    expect(hips.rotation.equals(initial)).toBe(true);
    expect(spine.rotation.equals(upperBody)).toBe(true);
    expect(() => new CharacterRootStabilizer(undefined).update(position)).not.toThrow();
});
