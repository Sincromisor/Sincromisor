import { describe, expect, it } from "vitest";

import { RtcNegotiationStateMachine } from "../rtcNegotiationStateMachine";

describe("RtcNegotiationStateMachine", () => {
    it("commits an initial Pion identity and advances revision only after matching Answer", () => {
        const machine = new RtcNegotiationStateMachine();
        const initial = machine.beginInitial("request-1");
        machine.commitAnswer(initial, {
            offer_revision: 1,
            session_id: "session-1",
        });

        const update = machine.beginRestart();
        expect(machine.identity?.revision).toBe(1);
        machine.commitAnswer(update, {
            offer_revision: 2,
            session_id: "session-1",
        });

        expect(machine.identity).toEqual({
            requestId: "request-1",
            revision: 2,
            sessionId: "session-1",
        });
        expect(machine.mode).toBe("pion");
    });

    it("rejects update Answer identity mismatches without advancing current revision", () => {
        const machine = new RtcNegotiationStateMachine();
        const initial = machine.beginInitial("request-1");
        machine.commitAnswer(initial, {
            offer_revision: 1,
            session_id: "session-1",
        });
        const update = machine.beginRestart();

        expect(() =>
            machine.commitAnswer(update, {
                offer_revision: 3,
                session_id: "session-1",
            }),
        ).toThrow("revision identity mismatch");
        expect(machine.identity?.revision).toBe(1);
    });

    it("accepts missing revision only for an initial legacy Answer", () => {
        const machine = new RtcNegotiationStateMachine();
        const initial = machine.beginInitial("request-1");
        machine.commitAnswer(initial, { session_id: "legacy-session" });

        expect(machine.mode).toBe("legacy");
        expect(() => machine.beginRestart()).toThrow("connected Pion session");
    });

    it("keeps 64 candidates FIFO and fails the generation on candidate 65", () => {
        const machine = new RtcNegotiationStateMachine();
        machine.beginInitial("request-1");
        for (let index = 0; index < 64; index += 1) {
            machine.enqueueCandidate({ candidate: `candidate-${index}` }, 1);
        }

        expect(() => machine.enqueueCandidate({ candidate: "candidate-overflow" }, 1)).toThrow(
            "queue overflow",
        );
        expect(machine.drainCandidates(1)).toEqual([]);
    });

    it("drains candidates in collection order after the matching Answer", () => {
        const machine = new RtcNegotiationStateMachine();
        const initial = machine.beginInitial("request-1");
        machine.enqueueCandidate({ candidate: "candidate-1" }, 1);
        machine.enqueueCandidate(null, 1);
        machine.commitAnswer(initial, {
            offer_revision: 1,
            session_id: "session-1",
        });

        expect(machine.drainCandidates(1).map((entry) => entry.candidate)).toEqual([
            { candidate: "candidate-1" },
            null,
        ]);
    });

    it("cancels restartPending when connected returns during grace", () => {
        const machine = new RtcNegotiationStateMachine();
        const initial = machine.beginInitial("request-1");
        machine.commitAnswer(initial, {
            offer_revision: 1,
            session_id: "session-1",
        });

        expect(machine.markRestartPending()).toBe(true);
        machine.restoreConnected();

        expect(machine.state).toBe("connected");
        expect(machine.markRestartPending()).toBe(true);
        expect(machine.markRestartPending()).toBe(false);
    });
});
