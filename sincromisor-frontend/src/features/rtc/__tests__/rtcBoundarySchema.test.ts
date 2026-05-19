import { describe, expect, it } from "vitest";

import {
    parseChatMessagePayload,
    parseIceCandidateResponse,
    parseOfferResponse,
    parseSincroRTCConfig,
    parseTelopChannelPayload,
} from "../rtcBoundarySchema";

describe("parseSincroRTCConfig", () => {
    it("accepts single and multiple ICE server URLs", () => {
        const config = parseSincroRTCConfig({
            offerURL: "/api/v1/RTCSignalingServer/offer",
            candidateURL: "/api/v1/RTCSignalingServer/candidate",
            iceServers: [
                { urls: "stun:stun.example.test:3478" },
                {
                    urls: ["turn:turn-a.example.test:3478", "turn:turn-b.example.test:3478"],
                    username: "rtc-user",
                    credential: "rtc-credential",
                },
            ],
        });

        expect(config.iceServers).toHaveLength(2);
        expect(config.iceServers[1]?.urls).toEqual([
            "turn:turn-a.example.test:3478",
            "turn:turn-b.example.test:3478",
        ]);
    });

    it("rejects malformed RTC config payloads", () => {
        expect(() =>
            parseSincroRTCConfig({
                offerURL: "/api/v1/RTCSignalingServer/offer",
                candidateURL: "/api/v1/RTCSignalingServer/candidate",
            }),
        ).toThrow();
    });
});

describe("parseOfferResponse", () => {
    it("accepts WebRTC answer payloads", () => {
        expect(
            parseOfferResponse({
                sdp: "v=0",
                type: "answer",
                session_id: "session-1",
            }),
        ).toEqual({
            sdp: "v=0",
            type: "answer",
            session_id: "session-1",
        });
    });

    it("rejects unsupported SDP response types", () => {
        expect(() =>
            parseOfferResponse({
                sdp: "v=0",
                type: "rollback",
                session_id: "session-1",
            }),
        ).toThrow();
    });
});

describe("parseIceCandidateResponse", () => {
    it("accepts optional status and reason fields", () => {
        expect(parseIceCandidateResponse({})).toEqual({});
        expect(parseIceCandidateResponse({ status: false, reason: "candidate rejected" })).toEqual({
            status: false,
            reason: "candidate rejected",
        });
    });
});

describe("parseChatMessagePayload", () => {
    it("normalizes null expression_code to undefined at the DataChannel boundary", () => {
        const message = parseChatMessagePayload(
            JSON.stringify({
                message_id: "message-1",
                message_type: "chat",
                speaker_id: "assistant",
                speaker_name: "Assistant",
                speech_id: 10,
                expression_code: null,
                message: "hello",
                created_at: 1_775_373_600,
            }),
        );

        expect(message.expression_code).toBeUndefined();
        expect(message.message).toBe("hello");
    });
});

describe("parseTelopChannelPayload", () => {
    it("accepts telop segment payloads", () => {
        expect(
            parseTelopChannelPayload(
                JSON.stringify({
                    speech_id: 10,
                    timestamp: 120,
                    message: "hello",
                    vowel: "a",
                    text: "h",
                    length: 1,
                    new_text: true,
                }),
            ),
        ).toEqual({
            speech_id: 10,
            timestamp: 120,
            message: "hello",
            vowel: "a",
            text: "h",
            length: 1,
            new_text: true,
        });
    });

    it("rejects non-boolean new_text values", () => {
        expect(() =>
            parseTelopChannelPayload(
                JSON.stringify({
                    speech_id: 10,
                    timestamp: 120,
                    message: "hello",
                    vowel: "a",
                    text: "h",
                    length: 1,
                    new_text: "true",
                }),
            ),
        ).toThrow();
    });
});
