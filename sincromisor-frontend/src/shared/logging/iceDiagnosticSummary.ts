import { z } from "zod";

/** ICE失敗時だけ中央へ送る固定値。欠損は省略し、アドレスや候補IDを受け付けない。 */
export const iceDiagnosticSummarySchema = z.strictObject({
    signaling_state: z
        .enum([
            "stable",
            "closed",
            "have-local-offer",
            "have-local-pranswer",
            "have-remote-offer",
            "have-remote-pranswer",
        ])
        .optional(),
    gathering_state: z.enum(["new", "gathering", "complete"]).optional(),
    pair_state: z.enum(["frozen", "waiting", "in-progress", "failed", "succeeded"]).optional(),
    local_type: z.enum(["host", "srflx", "prflx", "relay"]).optional(),
    remote_type: z.enum(["host", "srflx", "prflx", "relay"]).optional(),
    pair_count: z.number().int().min(0).max(1000000).optional(),
    succeeded_pair_count: z.number().int().min(0).max(1000000).optional(),
    rtt_ms: z.number().min(0).max(Number.MAX_VALUE).optional(),
});

/** 件数は整数、RTTはミリ秒の有限数。選択ペアがなければ関連項目を省く。 */
export type IceDiagnosticSummary = z.infer<typeof iceDiagnosticSummarySchema>;
