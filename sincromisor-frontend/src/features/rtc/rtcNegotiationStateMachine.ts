export type RtcNegotiationPhase =
    | "idle"
    | "initializing"
    | "connected"
    | "restartPending"
    | "restarting"
    | "replacing"
    | "closed";

export type RtcNegotiationMode = "pion" | "legacy";

export type RtcOfferIdentity = {
    requestId: string;
    revision: number;
    sessionId?: string;
};

export type QueuedRtcCandidate = {
    candidate: RTCIceCandidateInit | null;
    generation: number;
    revision: number;
};

const MAX_CANDIDATES_PER_GENERATION = 64;

/**
 * 1つのPeerConnection generationに属するoffer identityとcandidate queueを所有する。
 *
 * revisionはAnswerのidentity検証後だけcommitし、queueはそのrevisionのAnswer受理前に
 * 発生したcandidateをFIFOで保持する。失敗時はgeneration全体を破棄できるため、
 * candidateが別session/revisionへ流用されることはない。
 */
export class RtcNegotiationStateMachine {
    private candidateGeneration = 0;
    private candidates: QueuedRtcCandidate[] = [];
    private currentIdentity?: RtcOfferIdentity;
    private negotiationMode?: RtcNegotiationMode;
    private phase: RtcNegotiationPhase = "idle";

    get state(): RtcNegotiationPhase {
        return this.phase;
    }

    get mode(): RtcNegotiationMode | undefined {
        return this.negotiationMode;
    }

    get identity(): RtcOfferIdentity | undefined {
        return this.currentIdentity;
    }

    /**
     * 新PeerConnection上のinitial negotiationを開始する。
     * request IDはSDP生成ごとに呼び出し元が発行し、HTTP retry中はこのidentityを維持する。
     */
    beginInitial(requestId: string): RtcOfferIdentity {
        this.requireOpen();
        this.phase = this.phase === "replacing" ? "replacing" : "initializing";
        this.candidateGeneration += 1;
        this.candidates = [];
        this.currentIdentity = { requestId, revision: 1 };
        this.negotiationMode = undefined;
        return this.currentIdentity;
    }

    /**
     * current revisionを進めずにrestart用identityを作る。
     * Answer成功までidentityは旧revisionを保持し、candidateだけを次revisionへ帰属させる。
     */
    beginRestart(): RtcOfferIdentity {
        this.requireOpen();
        const identity = this.requirePionIdentity();
        this.phase = "restarting";
        this.candidateGeneration += 1;
        this.candidates = [];
        return {
            requestId: identity.requestId,
            revision: identity.revision + 1,
            sessionId: identity.sessionId,
        };
    }

    markRestartPending(): boolean {
        if (this.phase !== "connected") {
            return false;
        }
        this.phase = "restartPending";
        return true;
    }

    restoreConnected(): void {
        if (this.phase === "restartPending") {
            this.phase = "connected";
        }
    }

    markReplacing(): void {
        this.requireOpen();
        this.phase = "replacing";
        this.candidates = [];
    }

    /**
     * Answer identityを検証し、成功したrevisionだけをcurrentとしてcommitする。
     * revision欠落はinitial Answerだけlegacy modeとして許容する。
     */
    commitAnswer(
        pending: RtcOfferIdentity,
        answer: { offer_revision?: number; session_id: string },
    ): void {
        if (answer.session_id !== (pending.sessionId ?? answer.session_id)) {
            throw new Error("RTC Answer session identity mismatch.");
        }
        if (answer.offer_revision === undefined) {
            if (pending.revision !== 1 || pending.sessionId !== undefined) {
                throw new Error("RTC update Answer is missing offer_revision.");
            }
            this.negotiationMode = "legacy";
        } else {
            if (answer.offer_revision !== pending.revision) {
                throw new Error("RTC Answer revision identity mismatch.");
            }
            this.negotiationMode = "pion";
        }
        this.currentIdentity = {
            requestId: pending.requestId,
            revision: pending.revision,
            sessionId: answer.session_id,
        };
        this.phase = "connected";
    }

    enqueueCandidate(candidate: RTCIceCandidateInit | null, revision: number): void {
        this.requireOpen();
        if (this.candidates.length >= MAX_CANDIDATES_PER_GENERATION) {
            this.failGeneration();
            throw new Error("RTC candidate queue overflow.");
        }
        this.candidates.push({
            candidate,
            generation: this.candidateGeneration,
            revision,
        });
    }

    drainCandidates(revision: number): QueuedRtcCandidate[] {
        const candidates = this.candidates.filter(
            (candidate) =>
                candidate.generation === this.candidateGeneration &&
                candidate.revision === revision,
        );
        this.candidates = [];
        return candidates;
    }

    failGeneration(): void {
        this.candidates = [];
    }

    close(): void {
        this.phase = "closed";
        this.candidates = [];
        this.currentIdentity = undefined;
    }

    private requirePionIdentity(): RtcOfferIdentity {
        if (this.negotiationMode !== "pion" || this.currentIdentity?.sessionId === undefined) {
            throw new Error("RTC restart requires a connected Pion session.");
        }
        return this.currentIdentity;
    }

    private requireOpen(): void {
        if (this.phase === "closed") {
            throw new Error("RTC negotiation state machine is closed.");
        }
    }
}
