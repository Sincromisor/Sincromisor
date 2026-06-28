import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const worktreeRoot = process.env.EVAL_WORKTREE_ROOT;
if (!worktreeRoot) {
    throw new Error("EVAL_WORKTREE_ROOT is required.");
}

async function importFromWorktree(path) {
    return import(pathToFileURL(`${worktreeRoot}/${path}`).href);
}

const { runMotionQaRegression } = await importFromWorktree(
    "sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts",
);
const { MOTION_P0_FIXTURE_IDS } = await importFromWorktree(
    "sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts",
);
const { BASE_CONFIG, createLogText } = await importFromWorktree(
    "sincromisor-frontend/src/character/motionEvaluation/__tests__/motionQaRegressionTestFixtures.ts",
);

function manifest(fixtures, extraConfig = {}) {
    return runMotionQaRegression({
        manifest: {
            schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
            fixtures,
        },
        config: {
            ...BASE_CONFIG,
            ...extraConfig,
        },
    });
}

describe("motion QA regression edge acceptance", () => {
    it("reports unknown and duplicate fixture ids as invalid fixtures", async () => {
        const logText = createLogText("neutral-10s");
        const result = await manifest([
            { fixtureId: "unknown-fixture", logText },
            { fixtureId: "neutral-10s", logText },
            { fixtureId: "neutral-10s", logText },
        ]);

        expect(result.overall).toBe("fail");
        expect(result.fixtures[0]).toMatchObject({
            fixtureId: "unknown-fixture",
            status: "invalid_fixture",
        });
        expect(result.fixtures[2]).toMatchObject({
            fixtureId: "neutral-10s",
            status: "invalid_fixture",
        });
    });

    it("fails empty fixture lists and only requires all P0 fixtures when opted in", async () => {
        const empty = await manifest([]);
        expect(empty).toMatchObject({ overall: "fail", fixtures: [] });

        const subset = await manifest([{ fixtureId: "neutral-10s", logText: createLogText("neutral-10s") }]);
        expect(subset.fixtures.some((fixture) => fixture.status === "missing_fixture")).toBe(false);

        const required = await manifest(
            [{ fixtureId: "neutral-10s", logText: createLogText("neutral-10s") }],
            { requireAllP0Fixtures: true },
        );
        expect(required.overall).toBe("fail");
        expect(required.fixtures.filter((fixture) => fixture.status === "missing_fixture")).toHaveLength(
            MOTION_P0_FIXTURE_IDS.length - 1,
        );
    });

    it("handles invalid sources, rejected fetchers, middle blank lines, and no-frame logs", async () => {
        const logText = createLogText("neutral-10s");
        const withMiddleBlank = logText.replace("\n", "\n\n");
        const manifestOnly = logText.split(/\r?\n/)[0];

        const invalidBoth = await manifest([
            { fixtureId: "neutral-10s", logText, logUrl: "/fixture.ndjson" },
        ]);
        expect(invalidBoth.fixtures[0]).toMatchObject({ status: "invalid_fixture" });

        const rejectedFetch = await runMotionQaRegression({
            manifest: {
                schemaVersion: "sincro.motion-qa-fixture-manifest.v1",
                fixtures: [{ fixtureId: "fast-wave", logUrl: "/fixture.ndjson" }],
            },
            config: BASE_CONFIG,
            fetchLogText: async () => {
                throw new Error("fetch rejected");
            },
        });
        expect(rejectedFetch.fixtures[0]).toMatchObject({ status: "fail" });

        const blankLine = await manifest([{ fixtureId: "neutral-10s", logText: withMiddleBlank }]);
        expect(blankLine.fixtures[0].status).toBe("fail");
        expect(blankLine.fixtures[0].errors.join("\n")).toContain("invalid_json");

        const noFrames = await manifest([{ fixtureId: "neutral-10s", logText: manifestOnly }]);
        expect(noFrames.fixtures[0]).toMatchObject({
            status: "warn",
            summary: { severity: "warn" },
        });
    });
});
