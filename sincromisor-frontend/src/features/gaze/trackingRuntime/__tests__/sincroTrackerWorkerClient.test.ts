import { afterEach, expect, it, vi } from "vitest";
import { SincroTrackerWorkerClient } from "../sincroTrackerWorkerClient";
import type { SincroTrackerWorkerOutputMessage } from "../sincroTrackerWorkerTypes";

afterEach(() => vi.unstubAllGlobals());

it("disposeは初期化待ちを中断し、旧Workerのreadyが新しい待機を完了させない", async () => {
    const workers: WaitingWorker[] = [];
    class WaitingWorker {
        onmessage?: (event: MessageEvent<SincroTrackerWorkerOutputMessage>) => void;
        postMessage() {}
        terminate() {}
        constructor() {
            workers.push(this);
        }
        ready() {
            this.onmessage?.(
                new MessageEvent("message", { data: { type: "status", status: "ready" } }),
            );
        }
    }
    vi.stubGlobal("Worker", WaitingWorker);
    vi.stubGlobal("createImageBitmap", vi.fn());
    const client = new SincroTrackerWorkerClient();
    const first = client.init(false, false, false, false);
    const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
    client.dispose();
    await cancelled;
    let settled = false;
    const second = client.init(false, false, false, false).then(() => {
        settled = true;
    });
    workers[0].ready();
    await Promise.resolve();
    expect(settled).toBe(false);
    workers[1].ready();
    await second;
    expect(client.getStats().status).toBe("ready");
    client.dispose();
});
