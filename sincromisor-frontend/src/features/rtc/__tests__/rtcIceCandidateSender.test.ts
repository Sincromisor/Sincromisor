import { afterEach, describe, expect, it, vi } from "vitest";

import candidateFixtures from "../../../../../sincromisor-server/sincro-rtc-pion-poc/internal/signaling/testdata/candidate_requests.json?raw";
import { sendRtcIceCandidate } from "../rtcIceCandidateSender";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("sendRtcIceCandidate", () => {
    it("serializes the shared Go candidate request fixture", async () => {
        const fixture = JSON.parse(candidateFixtures)[0].request;
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('{"status":true}', {
                status: 200,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await sendRtcIceCandidate({
            candidate: fixture.candidate,
            logger: {
                addRtcEventLog: vi.fn(),
                addTextChannelLog: vi.fn(),
            },
            offerRevision: fixture.offer_revision,
            sessionId: fixture.session_id,
            sincroConfig: { candidateURL: "/candidate" },
        });

        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(fixture);
    });

    it("treats a 200 response schema failure as terminal without retry", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('{"status":"invalid"}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            sendRtcIceCandidate({
                candidate: null,
                logger: {
                    addRtcEventLog: vi.fn(),
                    addTextChannelLog: vi.fn(),
                },
                offerRevision: 1,
                sessionId: "session-1",
                sincroConfig: { candidateURL: "/candidate" },
            }),
        ).rejects.toThrow();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
