import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { SincroPageAppShell } from "./sincroPageAppShell";

export function bootstrapSincroPageAppShell<TModule>(
    loadControlPanel: () => Promise<TModule>,
    renderControlPanel: (module: TModule) => ReactElement,
): void {
    const mountNode = document.getElementById("sincroPageRoot");
    if (!mountNode) {
        throw new Error("div#sincroPageRoot is not found.");
    }

    void loadControlPanel().then((module) => {
        createRoot(mountNode).render(
            <SincroPageAppShell controlPanel={renderControlPanel(module)} />,
        );
    });
}
