import { z } from "zod";

const rtcSdpTypeSchema = z.enum(["answer", "offer", "pranswer"]);

const iceServerConfigSchema = z.object({
    urls: z.union([z.string(), z.array(z.string())]),
    username: z.string().optional(),
    credential: z.string().optional(),
});

const sincroRtcConfigSchema = z.object({
    offerURL: z.string(),
    candidateURL: z.string(),
    iceServers: z.array(iceServerConfigSchema),
});

const offerResponseSchema = z.object({
    sdp: z.string(),
    type: rtcSdpTypeSchema,
    session_id: z.string(),
});

const iceCandidateResponseSchema = z.object({
    status: z.boolean().optional(),
    reason: z.string().optional(),
});

const optionalExpressionCodeSchema = z.preprocess(
    (value) => (value === null ? undefined : value),
    z.number().finite().optional(),
);

const chatMessagePayloadSchema = z.object({
    message_id: z.string(),
    message_type: z.string(),
    speaker_id: z.string(),
    speaker_name: z.string(),
    speech_id: z.number().finite(),
    expression_code: optionalExpressionCodeSchema,
    message: z.string(),
    created_at: z.number().finite(),
});

const telopChannelPayloadSchema = z.object({
    speech_id: z.number().finite(),
    timestamp: z.number().finite(),
    message: z.string(),
    vowel: z.string(),
    text: z.string(),
    length: z.number().finite(),
    new_text: z.boolean(),
});

export type IceServerConfig = z.infer<typeof iceServerConfigSchema>;
export type SincroRTCConfig = z.infer<typeof sincroRtcConfigSchema>;
export type OfferResponse = z.infer<typeof offerResponseSchema>;
export type IceCandidateResponse = z.infer<typeof iceCandidateResponseSchema>;
export type ChatMessage = z.infer<typeof chatMessagePayloadSchema>;
export type ChatHistory = {
    messages: ChatMessage[];
};
export type TelopChannelMessage = z.infer<typeof telopChannelPayloadSchema>;

export function parseSincroRTCConfig(value: unknown): SincroRTCConfig {
    return sincroRtcConfigSchema.parse(value);
}

export function parseOfferResponse(value: unknown): OfferResponse {
    return offerResponseSchema.parse(value);
}

export function parseIceCandidateResponse(value: unknown): IceCandidateResponse {
    return iceCandidateResponseSchema.parse(value);
}

export function parseChatMessagePayload(payload: string): ChatMessage {
    return chatMessagePayloadSchema.parse(JSON.parse(payload));
}

export function parseTelopChannelPayload(payload: string): TelopChannelMessage {
    return telopChannelPayloadSchema.parse(JSON.parse(payload));
}
