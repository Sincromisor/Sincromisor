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
    offer_revision: z.number().int().positive().optional(),
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
/** Offer Answerのwire表現。revision欠落はinitial接続のlegacy判定にだけ使用する。 */
export type OfferResponse = z.infer<typeof offerResponseSchema>;
export type IceCandidateResponse = z.infer<typeof iceCandidateResponseSchema>;
export type ChatMessage = z.infer<typeof chatMessagePayloadSchema>;
export type ChatHistory = {
    messages: ChatMessage[];
};
export type TelopChannelMessage = z.infer<typeof telopChannelPayloadSchema>;

/** config.json境界を検証し、不正なendpoint/ICE設定を接続開始前にrejectする。 */
export function parseSincroRTCConfig(value: unknown): SincroRTCConfig {
    return sincroRtcConfigSchema.parse(value);
}

/**
 * Offer Answerを検証する。
 * session/revisionと送信identityの一致確認はstate machineがoperation context付きで行う。
 */
export function parseOfferResponse(value: unknown): OfferResponse {
    return offerResponseSchema.parse(value);
}

/** Candidate応答の任意status/reason fieldを検証し、JSON形状不正時はthrowする。 */
export function parseIceCandidateResponse(value: unknown): IceCandidateResponse {
    return iceCandidateResponseSchema.parse(value);
}

/** text_chのJSON文字列をChatMessageへ変換し、不正payloadをthrowする。 */
export function parseChatMessagePayload(payload: string): ChatMessage {
    return chatMessagePayloadSchema.parse(JSON.parse(payload));
}

/** telop_chのJSON文字列を口形同期segmentへ変換し、不正payloadをthrowする。 */
export function parseTelopChannelPayload(payload: string): TelopChannelMessage {
    return telopChannelPayloadSchema.parse(JSON.parse(payload));
}
