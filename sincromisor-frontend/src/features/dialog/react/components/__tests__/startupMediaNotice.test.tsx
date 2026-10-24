import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createDefaultSincroAppSettingsSnapshot } from "../../../../../app/settings/sincroAppSettingsDefaults";
import { StartupMediaNotice } from "../startupMediaNotice";

it("通常体験だけ認識データの保存を示し、詳細の保存先を区別する", () => {
    for (const talkMode of ["chat", "sincro", "echo", "playback"]) {
        const html = renderToStaticMarkup(
            <StartupMediaNotice
                settings={{ ...createDefaultSincroAppSettingsSnapshot(), talkMode }}
            />,
        );
        expect(html).toContain("音声を接続先サーバーへ送信します。");
        expect(html.includes("認識した音声と文章はサーバーに保存されます。")).toBe(
            talkMode === "chat" || talkMode === "sincro",
        );
        expect(html.includes("会話履歴もサーバーに保存します。")).toBe(talkMode === "chat");
        expect(html).toContain("VRMはサーバーへアップロードしません");
    }
});
