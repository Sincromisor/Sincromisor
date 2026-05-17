export function disableExternalCanvasPointerEvents(rendererCanvas: HTMLCanvasElement): void {
    // polyfill 側が追加する canvas が pointer を奪うと OrbitControls 操作が効かなくなるため、
    // LG セッション中は renderer 本体以外の canvas を操作対象から外す。
    const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas");
    canvases.forEach((canvas) => {
        if (canvas === rendererCanvas) {
            return;
        }
        if (!canvas.dataset.sincroPrevPointerEvents) {
            canvas.dataset.sincroPrevPointerEvents =
                canvas.style.pointerEvents === "" ? "__empty__" : canvas.style.pointerEvents;
        }
        canvas.style.pointerEvents = "none";
    });
}

export function restoreExternalCanvasPointerEvents(rendererCanvas: HTMLCanvasElement): void {
    const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas");
    canvases.forEach((canvas) => {
        if (canvas === rendererCanvas) {
            return;
        }
        const prev = canvas.dataset.sincroPrevPointerEvents;
        if (prev === undefined) {
            return;
        }
        canvas.style.pointerEvents = prev === "__empty__" ? "" : prev;
        delete canvas.dataset.sincroPrevPointerEvents;
    });
}
