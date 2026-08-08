import { expect, test } from "@playwright/test";

const CONTROL_EVENT = "sincro-gate3-control";
const OBSERVATION_EVENT = "sincro-gate3-observation";

type OfferBody = {
    offer_request_id: string;
    offer_revision: number;
    session_id?: string;
};

type BrowserSnapshot = {
    audioPeak: number;
    channelCount: number;
    channelLabels: Record<string, number>;
    constructorRestored: boolean;
    error?: string;
    failedDispatches: number;
    iceConnectionState: string;
    signalingState: string;
    telopMessages: number;
    textMessages: string[];
};

test("current frontend completes a turn, production ICE restart, and a second turn", async ({
    page,
}) => {
    const offers: OfferBody[] = [];
    const candidateRevisions: number[] = [];
    const acceptedCandidateRevisions: number[] = [];
    const offerResponseSessions: string[] = [];
    const requests: Array<{ method: string; url: string }> = [];
    const consoleMessages: Array<{ args?: string; text: string; type: string }> = [];
    const pageErrors: string[] = [];
    const requestFailures: Array<{ error: string; method: string; url: string }> = [];
    let configResponse: { body: string; status: number } | undefined;
    let initialSessionID = "";
    page.on("console", async (message) => {
        if (consoleMessages.length >= 100) return;
        const type = message.type();
        const entry: { args?: string; text: string; type: string } = {
            type,
            text: message.text().slice(0, 500),
        };
        consoleMessages.push(entry);
        if (type !== "warning" && type !== "error") return;
        const args = await Promise.all(
            message
                .args()
                .slice(0, 5)
                .map(async (handle) => {
                    try {
                        return await handle.evaluate((value: unknown) => {
                            const describeError = (candidate: unknown) => {
                                if (!(candidate instanceof Error)) return String(candidate ?? "");
                                const cause = candidate.cause;
                                return {
                                    name: candidate.name,
                                    message: candidate.message,
                                    cause:
                                        cause instanceof Error
                                            ? {
                                                  name: cause.name,
                                                  message: cause.message,
                                                  stack: cause.stack?.split("\n", 1)[0] ?? "",
                                              }
                                            : String(cause ?? ""),
                                    status: "status" in candidate ? candidate.status : undefined,
                                    operation:
                                        "operation" in candidate ? candidate.operation : undefined,
                                    stack: candidate.stack?.split("\n", 1)[0] ?? "",
                                };
                            };
                            if (value instanceof Error) {
                                return describeError(value);
                            }
                            if (value !== null && typeof value === "object") {
                                const record = value as Record<string, unknown>;
                                const context =
                                    record.context !== null && typeof record.context === "object"
                                        ? (record.context as Record<string, unknown>)
                                        : undefined;
                                return {
                                    name: String(record.name ?? ""),
                                    message: String(record.message ?? ""),
                                    cause: String(record.cause ?? ""),
                                    status: String(record.status ?? ""),
                                    operation: String(record.operation ?? ""),
                                    contextError: describeError(context?.error),
                                };
                            }
                            return String(value);
                        });
                    } catch (error) {
                        return { serializationError: String(error).slice(0, 500) };
                    }
                }),
        );
        entry.args = JSON.stringify(args).slice(0, 2_000);
    });
    page.on("pageerror", (error) => {
        if (pageErrors.length < 20) pageErrors.push(error.message.slice(0, 1_000));
    });
    page.on("requestfailed", (request) => {
        if (requestFailures.length < 20) {
            requestFailures.push({
                error: request.failure()?.errorText ?? "unknown",
                method: request.method(),
                url: request.url(),
            });
        }
    });
    page.on("request", (request) => {
        const method = request.method();
        const url = request.url();
        if (requests.length < 200) requests.push({ method, url });
        if (method !== "POST") return;
        const body = request.postDataJSON() as Record<string, unknown>;
        if (url.endsWith("/offer")) offers.push(body as OfferBody);
        if (url.endsWith("/candidate")) {
            candidateRevisions.push(body.offer_revision as number);
        }
    });
    page.on("response", async (response) => {
        if (response.url().endsWith("/api/v1/RTCSignalingServer/config.json")) {
            configResponse = {
                body: (await response.text()).slice(0, 2_000),
                status: response.status(),
            };
        }
        if (response.request().method() !== "POST") return;
        if (response.url().endsWith("/candidate") && response.ok()) {
            const body = response.request().postDataJSON() as {
                offer_revision: number;
            };
            acceptedCandidateRevisions.push(body.offer_revision);
        }
        if (response.url().endsWith("/offer")) {
            const body = (await response.json()) as { session_id?: string };
            if (body.session_id) offerResponseSessions.push(body.session_id);
            if (!initialSessionID && body.session_id) initialSessionID = body.session_id;
        }
    });

    await page.addInitScript(
        ({ controlEvent, observationEvent }) => {
            const NativePeerConnection = window.RTCPeerConnection;
            let peerConnection: RTCPeerConnection | undefined;
            let audioContext: AudioContext | undefined;
            let audioAnalyser: AnalyserNode | undefined;
            let audioSource: MediaStreamAudioSourceNode | undefined;
            let audioFrame = 0;
            let audioPeak = 0;
            let audioError = "";
            let channelCount = 0;
            const channelLabels: Record<string, number> = {};
            const channelListeners: Array<{
                channel: RTCDataChannel;
                listener: (event: MessageEvent) => void;
            }> = [];
            let failedDispatches = 0;
            const messages = { telop_ch: 0, text_ch: [] as string[] };
            let nativeCreateDataChannel: RTCPeerConnection["createDataChannel"] | undefined;

            const observe = (detail: Record<string, unknown>) =>
                document.dispatchEvent(new CustomEvent(observationEvent, { detail }));
            const captureAudio = (event: RTCTrackEvent) => {
                if (event.track.kind !== "audio" || audioContext) return;
                const context = new AudioContext();
                audioContext = context;
                void (async () => {
                    if (context.state === "suspended") await context.resume();
                    if (context.state !== "running") {
                        throw new Error(`AudioContext did not start: ${context.state}`);
                    }
                    const analyser = context.createAnalyser();
                    const source = context.createMediaStreamSource(
                        event.streams[0] ?? new MediaStream([event.track]),
                    );
                    audioAnalyser = analyser;
                    audioSource = source;
                    source.connect(analyser);
                    const samples = new Uint8Array(analyser.fftSize);
                    const sample = () => {
                        analyser.getByteTimeDomainData(samples);
                        audioPeak = Math.max(
                            audioPeak,
                            ...samples.map((value) => Math.abs(value - 128)),
                        );
                        audioFrame = requestAnimationFrame(sample);
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
                const created = new NativePeerConnection(configuration);
                peerConnection = created;
                created.addEventListener("track", captureAudio);
                nativeCreateDataChannel = created.createDataChannel;
                created.createDataChannel = (label, options) => {
                    const channel = nativeCreateDataChannel?.call(created, label, options);
                    if (!channel) throw new Error("native createDataChannel is unavailable");
                    channelCount += 1;
                    channelLabels[label] = (channelLabels[label] ?? 0) + 1;
                    if (label === "text_ch" || label === "telop_ch") {
                        const listener = (event: MessageEvent) => {
                            const payload = JSON.parse(String(event.data)) as Record<
                                string,
                                unknown
                            >;
                            if (label === "text_ch") messages.text_ch.push(String(payload.message));
                            else messages.telop_ch += 1;
                        };
                        channel.addEventListener("message", listener);
                        channelListeners.push({ channel, listener });
                    }
                    return channel;
                };
                window.RTCPeerConnection = NativePeerConnection;
                observe({ kind: "peer", count: 1 });
                return created;
            } as unknown as typeof RTCPeerConnection;
            WrappedPeerConnection.prototype = NativePeerConnection.prototype;
            Object.setPrototypeOf(WrappedPeerConnection, NativePeerConnection);
            window.RTCPeerConnection = WrappedPeerConnection;

            const emitSnapshot = (error?: string) =>
                observe({
                    error: error ?? (audioError || undefined),
                    audioPeak,
                    channelCount,
                    channelLabels: { ...channelLabels },
                    constructorRestored: window.RTCPeerConnection === NativePeerConnection,
                    failedDispatches,
                    iceConnectionState: peerConnection?.iceConnectionState ?? "",
                    signalingState: peerConnection?.signalingState ?? "",
                    telopMessages: messages.telop_ch,
                    textMessages: [...messages.text_ch],
                });
            const control = async (event: Event) => {
                const command = (event as CustomEvent<{ command: string }>).detail.command;
                if (!peerConnection) {
                    emitSnapshot("RTCPeerConnection has not been captured");
                    return;
                }
                if (command === "fail") {
                    if (failedDispatches !== 0) {
                        emitSnapshot("failed event was already dispatched");
                        return;
                    }
                    failedDispatches += 1;
                    audioPeak = 0;
                    Object.defineProperty(peerConnection, "iceConnectionState", {
                        configurable: true,
                        get: () => "failed",
                    });
                    let restored = false;
                    try {
                        peerConnection.dispatchEvent(new Event("iceconnectionstatechange"));
                    } finally {
                        restored = Reflect.deleteProperty(peerConnection, "iceConnectionState");
                    }
                    if (!restored) {
                        emitSnapshot("failed to restore iceConnectionState");
                        return;
                    }
                }
                if (command === "cleanup") {
                    if (nativeCreateDataChannel)
                        peerConnection.createDataChannel = nativeCreateDataChannel;
                    for (const entry of channelListeners) {
                        entry.channel.removeEventListener("message", entry.listener);
                    }
                    peerConnection.removeEventListener("track", captureAudio);
                    cancelAnimationFrame(audioFrame);
                    audioSource?.disconnect();
                    audioAnalyser?.disconnect();
                    await audioContext?.close();
                    document.removeEventListener(controlEvent, control);
                }
                emitSnapshot();
            };
            // productionの生成物は差し替えず、最初の実PeerConnection、実DataChannel、remote audioだけをclosureに保持する。
            // getterはfailed event後に削除し、DataChannel/track listener、analyser、instance methodはcleanupで復元・回収する。
            document.addEventListener(controlEvent, control);
        },
        { controlEvent: CONTROL_EVENT, observationEvent: OBSERVATION_EVENT },
    );

    await page.goto("/simple-vrm/index.html");
    await expect(page.getByRole("button", { name: "開始する" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "開始する" }).click();
    try {
        await expect.poll(() => offers.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    } catch (error) {
        throw new Error(
            `Initial Offer was not observed. diagnostics=${JSON.stringify({ configResponse, consoleMessages, pageErrors, requestFailures, requests })}`,
            { cause: error },
        );
    }
    await expect.poll(() => initialSessionID, { timeout: 15_000 }).not.toBe("");
    await expect.poll(() => acceptedCandidateRevisions.includes(1), { timeout: 30_000 }).toBe(true);
    await expect
        .poll(
            () =>
                readSnapshot(page).then((snapshot) =>
                    ["connected", "completed"].includes(snapshot.iceConnectionState),
                ),
            { timeout: 30_000 },
        )
        .toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    await expect(page.getByText("固定文", { exact: true })).toBeVisible({
        timeout: 60_000,
    });
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
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.audioPeak), {
            timeout: 60_000,
        })
        .toBeGreaterThan(0);
    const firstSnapshot = await readSnapshot(page);
    const firstTextCount = firstSnapshot.textMessages.length;
    const firstTelopCount = firstSnapshot.telopMessages;

    await dispatchControl(page, "fail");
    try {
        await expect.poll(() => offers.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    } catch (error) {
        let snapshot: BrowserSnapshot | { error: string };
        try {
            snapshot = await readSnapshot(page);
        } catch (snapshotError) {
            snapshot = { error: String(snapshotError) };
        }
        throw new Error(
            `Update Offer was not observed. diagnostics=${JSON.stringify({ acceptedCandidateRevisions, consoleMessages, pageErrors, requestFailures, requests, snapshot })}`,
            { cause: error },
        );
    }
    await expect.poll(() => candidateRevisions.includes(2), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => acceptedCandidateRevisions.includes(2), { timeout: 30_000 }).toBe(true);
    await expect
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.textMessages.length), {
            timeout: 60_000,
        })
        .toBeGreaterThanOrEqual(firstTextCount + 2);
    await expect
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.telopMessages), {
            timeout: 60_000,
        })
        .toBeGreaterThan(firstTelopCount);
    const secondTextMessages = (await readSnapshot(page)).textMessages.slice(firstTextCount);
    expect(secondTextMessages).toEqual(expect.arrayContaining(["固定文", "固定された応答文"]));
    await expect
        .poll(() => readSnapshot(page).then((snapshot) => snapshot.audioPeak), {
            timeout: 60_000,
        })
        .toBeGreaterThan(0);

    const snapshot = await readSnapshot(page);
    expect(snapshot).toMatchObject({
        channelCount: 2,
        channelLabels: { telop_ch: 1, text_ch: 1 },
        failedDispatches: 1,
    });
    expect(["connected", "completed"]).toContain(snapshot.iceConnectionState);
    expect(snapshot.signalingState).not.toBe("closed");
    expect(offers[0]).toMatchObject({ offer_revision: 1 });
    expect(offers[1]).toMatchObject({
        offer_revision: 2,
        offer_request_id: offers[0].offer_request_id,
        session_id: initialSessionID,
    });
    expect(candidateRevisions).toContain(1);
    expect(acceptedCandidateRevisions).toEqual(expect.arrayContaining([1, 2]));
    expect(offerResponseSessions).toEqual([initialSessionID, initialSessionID]);

    const cleanup = await dispatchControl(page, "cleanup");
    expect(cleanup.constructorRestored).toBe(true);
});

async function dispatchControl(
    page: import("@playwright/test").Page,
    command: string,
): Promise<BrowserSnapshot> {
    const snapshot = await page.evaluate(
        ({ controlEvent, observationEvent, command }) =>
            new Promise<BrowserSnapshot>((resolve) => {
                document.addEventListener(
                    observationEvent,
                    (event) => resolve((event as CustomEvent<BrowserSnapshot>).detail),
                    { once: true },
                );
                document.dispatchEvent(new CustomEvent(controlEvent, { detail: { command } }));
            }),
        { controlEvent: CONTROL_EVENT, observationEvent: OBSERVATION_EVENT, command },
    );
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot;
}

async function readSnapshot(page: import("@playwright/test").Page): Promise<BrowserSnapshot> {
    return dispatchControl(page, "snapshot");
}
