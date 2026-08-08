import { expect, test } from "@playwright/test";

const CONTROL_EVENT = "sincro-gate3-control";
const OBSERVATION_EVENT = "sincro-gate3-observation";

type BrowserSnapshot = {
    audioPeak: number;
    error?: string;
    telopMessages: number;
    textMessages: string[];
};

test("current frontend completes one turn", async ({ page }) => {
    const offers: Array<{ offer_revision: number }> = [];
    const acceptedCandidateRevisions: number[] = [];
    page.on("request", (request) => {
        if (request.method() !== "POST" || !request.url().endsWith("/offer")) return;
        offers.push(request.postDataJSON() as { offer_revision: number });
    });
    page.on("response", async (response) => {
        if (
            response.request().method() === "POST" &&
            response.url().endsWith("/candidate") &&
            response.ok()
        ) {
            const body = response.request().postDataJSON() as { offer_revision: number };
            acceptedCandidateRevisions.push(body.offer_revision);
        }
    });

    await page.addInitScript(
        ({ controlEvent, observationEvent }) => {
            const NativePeerConnection = window.RTCPeerConnection;
            let audioContext: AudioContext | undefined;
            let audioPeak = 0;
            let audioError = "";
            const messages = { telop_ch: 0, text_ch: [] as string[] };

            const captureAudio = (event: RTCTrackEvent) => {
                if (event.track.kind !== "audio" || audioContext) return;
                const context = new AudioContext();
                audioContext = context;
                void (async () => {
                    if (context.state === "suspended") await context.resume();
                    const analyser = context.createAnalyser();
                    context
                        .createMediaStreamSource(event.streams[0] ?? new MediaStream([event.track]))
                        .connect(analyser);
                    const samples = new Uint8Array(analyser.fftSize);
                    const sample = () => {
                        analyser.getByteTimeDomainData(samples);
                        audioPeak = Math.max(
                            audioPeak,
                            ...samples.map((value) => Math.abs(value - 128)),
                        );
                        requestAnimationFrame(sample);
                    };
                    sample();
                })().catch((error) => {
                    audioError = String(error);
                });
            };
            const WrappedPeerConnection = function (
                this: RTCPeerConnection,
                configuration?: RTCConfiguration,
            ) {
                const peerConnection = new NativePeerConnection(configuration);
                peerConnection.addEventListener("track", captureAudio);
                const createDataChannel = peerConnection.createDataChannel;
                peerConnection.createDataChannel = (label, options) => {
                    const channel = createDataChannel.call(peerConnection, label, options);
                    if (label === "text_ch" || label === "telop_ch") {
                        channel.addEventListener("message", (event) => {
                            const payload = JSON.parse(String(event.data)) as Record<
                                string,
                                unknown
                            >;
                            if (label === "text_ch") messages.text_ch.push(String(payload.message));
                            else messages.telop_ch += 1;
                        });
                    }
                    return channel;
                };
                window.RTCPeerConnection = NativePeerConnection;
                return peerConnection;
            } as unknown as typeof RTCPeerConnection;
            WrappedPeerConnection.prototype = NativePeerConnection.prototype;
            Object.setPrototypeOf(WrappedPeerConnection, NativePeerConnection);
            window.RTCPeerConnection = WrappedPeerConnection;

            document.addEventListener(controlEvent, () => {
                document.dispatchEvent(
                    new CustomEvent(observationEvent, {
                        detail: {
                            audioPeak,
                            error: audioError || undefined,
                            telopMessages: messages.telop_ch,
                            textMessages: [...messages.text_ch],
                        } satisfies BrowserSnapshot,
                    }),
                );
            });
        },
        { controlEvent: CONTROL_EVENT, observationEvent: OBSERVATION_EVENT },
    );

    await page.goto("/simple-vrm/index.html");
    await expect(page.getByRole("button", { name: "開始する" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "開始する" }).click();
    await expect.poll(() => offers.length, { timeout: 15_000 }).toBe(1);
    await expect.poll(() => acceptedCandidateRevisions.includes(1), { timeout: 30_000 }).toBe(true);
    await expect(page.getByText("固定文", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("固定された応答文", { exact: true })).toBeVisible({
        timeout: 60_000,
    });
    await expect
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.textMessages.length), {
            timeout: 60_000,
        })
        .toBeGreaterThanOrEqual(2);
    await expect
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.telopMessages), {
            timeout: 60_000,
        })
        .toBeGreaterThan(0);
    await expect
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.audioPeak), { timeout: 60_000 })
        .toBeGreaterThan(0);

    const snapshot = await readSnapshot(page);
    if (snapshot.error) throw new Error(snapshot.error);
    expect(offers).toEqual([expect.objectContaining({ offer_revision: 1 })]);
    expect(snapshot.textMessages).toEqual(expect.arrayContaining(["固定文", "固定された応答文"]));
});

async function readSnapshot(page: import("@playwright/test").Page): Promise<BrowserSnapshot> {
    return page.evaluate(
        ({ controlEvent, observationEvent }) =>
            new Promise<BrowserSnapshot>((resolve) => {
                document.addEventListener(
                    observationEvent,
                    (event) => resolve((event as CustomEvent<BrowserSnapshot>).detail),
                    { once: true },
                );
                document.dispatchEvent(new Event(controlEvent));
            }),
        { controlEvent: CONTROL_EVENT, observationEvent: OBSERVATION_EVENT },
    );
}
