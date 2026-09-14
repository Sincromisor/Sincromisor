import { expect, it, vi } from "vitest";
import { parseAvatarMotionProfile } from "../avatarMotionProfileSchema";

// 保存検証が計測モジュールを再び読み込むと、このテストの読み込み自体が失敗する。
vi.mock("../avatarMotionProfile", () => {
    throw new Error("VRM measurement must not load");
});

it("計測処理なしで版を分類し、クラスインスタンスを拒否する", () => {
    expect(parseAvatarMotionProfile({ schemaVersion: "unsupported" })).toMatchObject({
        ok: false,
        errors: [{ code: "unknown_schema_version", path: ["schemaVersion"] }],
    });
    expect(parseAvatarMotionProfile({ model: new Date(0) })).toMatchObject({
        ok: false,
        errors: [{ code: "invalid_state", path: ["model"] }],
    });
});
