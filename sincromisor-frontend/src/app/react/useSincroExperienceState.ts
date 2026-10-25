import { useEffect, useState } from "react";
import type { SincroAppController } from "../controller";
import type { SincroAppMediaState } from "../controller/sincroAppTypes";
import type { SincroAudioInputState } from "../controller/sincroAudioInputState";
import { subscribeActiveSincroAppEvents } from "./subscribeActiveSincroAppEvents";

const unusedMedia: SincroAppMediaState = {
    experienceActive: false,
    microphone: "idle",
    camera: "idle",
};

/** 所有者の実トラックと音声取得結果を表示へ中継する。購読開始時にも現在値が配信される。 */
export function useSincroExperienceState() {
    const [media, setMedia] = useState(unusedMedia);
    const [audioInput, setAudioInput] = useState<SincroAudioInputState>({ status: "idle" });
    const [controller, setController] = useState<SincroAppController>();
    useEffect(
        () =>
            subscribeActiveSincroAppEvents({
                onControllerChange: (next) => {
                    setController(next);
                    setMedia(unusedMedia);
                    setAudioInput({ status: "idle" });
                },
                onEvent: (event) => {
                    if (event.type === "media_state") setMedia(event.state);
                    if (event.type === "audio_input_state") setAudioInput(event.state);
                },
            }),
        [],
    );
    return { media, audioInput, controller };
}
