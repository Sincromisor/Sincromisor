import { describe, expect, it } from "vitest";

const evalWorktree = process.env.EVAL_WORKTREE;
if (!evalWorktree) {
    throw new Error("EVAL_WORKTREE is required for acceptance evaluation");
}

const { Vector3 } = await import(
    `${evalWorktree}/sincromisor-frontend/node_modules/three/src/math/Vector3.js`
);
const { resolveArmIkPoleDirection } = await import(
    `${evalWorktree}/sincromisor-frontend/src/character/ik/sincroArmIkPole.ts`
);

function expectVectorClose(actual: InstanceType<typeof Vector3>, expected: InstanceType<typeof Vector3>) {
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe("arm pole state with unusable measured candidate", () => {
    it("keeps lost input on the previous pole even when measured pole is parallel to target", () => {
        const previous = new Vector3(0, 0, 1);
        const pole = resolveArmIkPoleDirection({
            elbowPole: new Vector3(1, 0, 0),
            target: new Vector3(1, 0, 0),
            bindPoleDirection: new Vector3(0, 1, 0),
            previousPoleDirection: previous,
            poleFlipDotThreshold: -0.08,
            temporalState: "lost",
        });

        expect(pole.state).toBe("lost");
        expect(pole.blendWeight).toBe(0);
        expectVectorClose(pole.direction, previous);
    });
});
