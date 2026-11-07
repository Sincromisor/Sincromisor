import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
    defaultSincroAppSettingsSnapshot,
    defaultSincroAppSettingsUiState,
} from "../../../../../app/settings/sincroAppSettingsDefaults";
import { DebugConsoleManager } from "../../../../debug/model/debugConsoleManager";
import { AudioPanelVadControls } from "../../../../debug/react/panels/audioPanelVadControls";
import { AudioProcessingToggles } from "../audioProcessingToggles";

it.each(["chat", "sincro", "echo", "playback"])(
    "%sは実効方針に合うVAD操作を表示する",
    (talkMode) => {
        const html = renderToStaticMarkup(
            <AudioProcessingToggles
                settings={{ ...defaultSincroAppSettingsSnapshot, talkMode, enableVadGate: true }}
                uiState={defaultSincroAppSettingsUiState}
                onApplySettings={vi.fn()}
            />,
        );
        expect(html).toContain("マイクをミュートする");
        expect(html.includes("無音時の送信を抑える")).toBe(
            talkMode === "echo" || talkMode === "playback",
        );
        const manager = DebugConsoleManager.getManager();
        manager.setClientVadEnabled(talkMode === "echo" || talkMode === "playback");
        const debug = renderToStaticMarkup(
            <AudioPanelVadControls audio={manager.getSnapshot().audio} manager={manager} />,
        );
        expect(debug.includes("学習VAD（Silero）を有効化")).toBe(
            talkMode === "echo" || talkMode === "playback",
        );
    },
);
