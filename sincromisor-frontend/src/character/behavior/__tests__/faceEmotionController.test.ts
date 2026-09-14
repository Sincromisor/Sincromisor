import { VRMExpression, VRMExpressionManager } from "@pixiv/three-vrm";
import { expect, it, vi } from "vitest";
import { CharacterBehaviorState } from "../characterBehaviorState";
import { FaceEmotionController } from "../faceEmotionController";

it("診断管理なしで表情と口形を分離し、同じメッセージを再適用せずログを返す", () => {
    const expressions = new VRMExpressionManager();
    const mouth = new VRMExpression("aa");
    const happy = new VRMExpression("happy");
    const bind = {
        index: 0,
        primitives: [{ uuid: "mouth" }],
        applyWeight() {},
        clearAppliedWeight() {},
    };
    mouth.addBind(bind);
    happy.addBind(bind);
    expressions.registerExpression(mouth);
    expressions.registerExpression(happy);
    const log = vi.fn();
    const controller = new FaceEmotionController(expressions, log);
    expect(happy.binds).toHaveLength(0);
    expect(mouth.binds).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
        "[emotion] detached 1 emotion morph binds overlapping mouth visemes\n",
    );
    const initial = CharacterBehaviorState.getManager().update(0);
    const snapshot = {
        ...initial,
        motionPolicy: { ...initial.motionPolicy, allowAiEmotion: true },
        aiSpeech: {
            ...initial.aiSpeech,
            lastTextMessage: {
                message_id: "same",
                message_type: "system",
                expression_code: 4,
                message: "test",
                speaker_id: "system",
                speaker_name: "system",
                speech_id: 1,
                created_at: 0,
            },
        },
        nowMs: 0,
    };
    controller.update(snapshot);
    controller.update({ ...snapshot, nowMs: 180 });
    expect(expressions.getValue("happy")).toBe(0.34);
    expect(
        log.mock.calls.filter(([message]) => message.includes("apply message_id=")),
    ).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
        "[emotion] apply message_id=same code=4 preset=happy exists=true intensity=0.34\n",
    );
    const disconnected = new FaceEmotionController(expressions);
    disconnected.update(snapshot);
    disconnected.update({ ...snapshot, nowMs: 180 });
    expect(expressions.getValue("happy")).toBe(0.34);
});
