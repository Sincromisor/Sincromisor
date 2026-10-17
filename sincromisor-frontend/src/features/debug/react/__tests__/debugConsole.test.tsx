import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DebugConsole } from "../debugConsole";

it("初期配置から追跡・受信音声DOMを一つずつ常設する", () => {
    const markup = renderToStaticMarkup(<DebugConsole />);
    for (const id of ["characterGazeVideo", "characterGazeMarker", "eyeTarget", "rtcAudio"]) {
        expect(markup.split(`id="${id}"`)).toHaveLength(2);
    }
    expect(markup).toContain('class="gazePanelDetails"');
});
