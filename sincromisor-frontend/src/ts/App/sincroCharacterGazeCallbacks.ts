import type { CharacterGaze } from "../CharacterGaze/CharacterGaze";
import type { DebugConsoleManager } from "../UI/DebugConsoleManager";
import type { DialogManager } from "../UI/DialogManager";

type CharacterGazeCallbackOptions = {
    characterGaze: CharacterGaze;
    debugConsoleManager: DebugConsoleManager;
    dialogManager: DialogManager;
    onMuteChange: (mute: boolean) => void;
};

export function bindCharacterGazeCallbacks(options: CharacterGazeCallbackOptions): void {
    const { characterGaze, debugConsoleManager, dialogManager, onMuteChange } = options;
    // AutoMute の実適用は RTC controller 側に残し、この関数は視線イベント変換だけを担当する。
    characterGaze.arriveCallback = () => {
        debugConsoleManager.updateCharacterEyeStatus(true);
        if (dialogManager.enableAutoMute()) {
            onMuteChange(false);
        }
    };
    characterGaze.leaveCallback = () => {
        debugConsoleManager.updateCharacterEyeStatus(false);
        if (dialogManager.enableAutoMute()) {
            onMuteChange(true);
        }
    };
}
