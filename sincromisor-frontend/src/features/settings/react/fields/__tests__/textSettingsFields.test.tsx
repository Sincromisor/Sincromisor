import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
    createDefaultSincroAppSettingsSnapshot,
    createDefaultSincroAppSettingsUiState,
} from "../../../../../app/settings/sincroAppSettingsDefaults";
import { TalkModeField } from "../textSettingsFields";

it("体験の選択欄は音声診断だけに固有情報を関連付ける", () => {
    for (const talkMode of ["chat", "sincro", "echo", "playback"]) {
        const html = renderToStaticMarkup(
            <TalkModeField
                settings={{ ...createDefaultSincroAppSettingsSnapshot(), talkMode }}
                uiState={createDefaultSincroAppSettingsUiState()}
                onTalkModeChange={() => {}}
            />,
        );
        expect(html.includes("aria-describedby")).toBe(
            talkMode === "echo" || talkMode === "playback",
        );
        expect(html).not.toContain("再接続");
        if (talkMode === "echo") expect(html).toContain("自動ミュートは適用しません");
        if (talkMode === "playback") expect(html).toContain("VOICEVOX:ずんだもん");
    }
});
