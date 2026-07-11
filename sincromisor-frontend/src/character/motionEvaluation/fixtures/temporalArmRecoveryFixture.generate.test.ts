import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import {
    generateTemporalArmRecoveryFixture,
    type TemporalArmRecoveryFixtureId,
} from "./temporalArmRecoveryFixture";

const FIXTURE_IDS: TemporalArmRecoveryFixtureId[] = [
    "left-arm-occlusion-recovery",
    "right-arm-occlusion-recovery",
];

describe("temporal recovery fixture artifact generation", () => {
    const generationTest =
        process.env.SINCRO_WRITE_RECOVERY_FIXTURES === "1"
            ? it.each(FIXTURE_IDS)
            : it.skip.each(FIXTURE_IDS);
    generationTest("writes %s only through the explicit generation command", (fixtureId) => {
        const outputUrl = new URL(`./${fixtureId}.ndjson`, import.meta.url);
        writeFileSync(
            fileURLToPath(outputUrl),
            generateTemporalArmRecoveryFixture(fixtureId),
            "utf8",
        );
    });
});
