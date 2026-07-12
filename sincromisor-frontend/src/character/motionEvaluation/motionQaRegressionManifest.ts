/**
 * Motion QA fixture manifest の fixture 検証と log text 正規化を担当する。
 * P0 fixture id subset と required-all 判定のため、fixture id の fallback を暗黙生成せず caller へ validation result を返す。
 */
import { MOTION_P0_FIXTURE_IDS, type MotionP0FixtureId } from "./motionMetrics";
import type { MotionQaFixtureResult, MotionQaSubjectiveChecklistItem } from "./motionQaRegression";

type ManifestFixture = {
    fixtureId: unknown;
    logText?: unknown;
    logUrl?: unknown;
    baseline?: unknown;
    subjectiveChecklist?: unknown;
};

export type ValidManifestFixture = {
    fixtureId: MotionP0FixtureId;
    logText?: string;
    logUrl?: string;
    baseline?: unknown;
    subjectiveChecklist: MotionQaSubjectiveChecklistItem[];
};

export type FixtureValidationResult =
    | { ok: true; fixture: ValidManifestFixture }
    | { ok: false; result: MotionQaFixtureResult };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMotionP0FixtureId(value: unknown): value is MotionP0FixtureId {
    return MOTION_P0_FIXTURE_IDS.some((fixtureId) => fixtureId === value);
}

function isSubjectiveChecklistItem(value: unknown): value is MotionQaSubjectiveChecklistItem {
    return (
        value === "natural" ||
        value === "stable" ||
        value === "intentReadable" ||
        value === "noBreakage"
    );
}

function parseSubjectiveChecklist(value: unknown): MotionQaSubjectiveChecklistItem[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(isSubjectiveChecklistItem);
}

function invalidFixtureResult(fixtureId: unknown, errors: string[]): MotionQaFixtureResult {
    return {
        fixtureId: typeof fixtureId === "string" ? fixtureId : "invalid-fixture",
        status: "invalid_fixture",
        subjectiveChecklist: [],
        errors,
    };
}

export function validateFixture(
    fixture: ManifestFixture,
    seenFixtureIds: Set<MotionP0FixtureId>,
): FixtureValidationResult {
    if (!isMotionP0FixtureId(fixture.fixtureId)) {
        return {
            ok: false,
            result: invalidFixtureResult(fixture.fixtureId, [
                "Motion QA fixtureId is not supported.",
            ]),
        };
    }
    if (seenFixtureIds.has(fixture.fixtureId)) {
        return {
            ok: false,
            result: invalidFixtureResult(fixture.fixtureId, ["Motion QA fixtureId is duplicated."]),
        };
    }
    seenFixtureIds.add(fixture.fixtureId);

    const hasLogText = fixture.logText !== undefined;
    const hasLogUrl = fixture.logUrl !== undefined;
    if (hasLogText === hasLogUrl) {
        return {
            ok: false,
            result: invalidFixtureResult(fixture.fixtureId, [
                "Motion QA fixture must provide exactly one of logText or logUrl.",
            ]),
        };
    }
    if (hasLogText && typeof fixture.logText !== "string") {
        return {
            ok: false,
            result: invalidFixtureResult(fixture.fixtureId, [
                "Motion QA fixture logText must be a string.",
            ]),
        };
    }
    if (hasLogUrl && typeof fixture.logUrl !== "string") {
        return {
            ok: false,
            result: invalidFixtureResult(fixture.fixtureId, [
                "Motion QA fixture logUrl must be a string.",
            ]),
        };
    }

    return {
        ok: true,
        fixture: {
            fixtureId: fixture.fixtureId,
            logText: typeof fixture.logText === "string" ? fixture.logText : undefined,
            logUrl: typeof fixture.logUrl === "string" ? fixture.logUrl : undefined,
            baseline: fixture.baseline,
            subjectiveChecklist: parseSubjectiveChecklist(fixture.subjectiveChecklist),
        },
    };
}

export function readManifestFixtures(manifest: unknown): ManifestFixture[] | undefined {
    if (!isRecord(manifest)) {
        return undefined;
    }
    if (manifest.schemaVersion !== "sincro.motion-qa-fixture-manifest.v1") {
        return undefined;
    }
    if (!Array.isArray(manifest.fixtures)) {
        return undefined;
    }
    return manifest.fixtures.map((fixture) => {
        if (!isRecord(fixture)) {
            return { fixtureId: undefined };
        }
        return {
            fixtureId: fixture.fixtureId,
            logText: fixture.logText,
            logUrl: fixture.logUrl,
            baseline: fixture.baseline,
            subjectiveChecklist: fixture.subjectiveChecklist,
        };
    });
}

export function logTextToLines(text: string): string[] {
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}
