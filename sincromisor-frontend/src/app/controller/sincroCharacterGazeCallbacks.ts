import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { DialogManager } from "../../features/dialog/model/dialogManager";
import type { CharacterGaze } from "../../features/gaze/characterGaze/characterGaze";

type CharacterGazeCallbackOptions = {
    characterGaze: CharacterGaze;
    debugConsoleManager: DebugConsoleManager;
    dialogManager: DialogManager;
    onMuteChange: (mute: boolean) => void;
};

/** 視線の入退場をミュート操作へつなぐ。自動ミュート設定はイベント発生時の値で判定する。 */
export function bindCharacterGazeCallbacks(options: CharacterGazeCallbackOptions): void {
    const { characterGaze, debugConsoleManager, dialogManager, onMuteChange } = options;
    // AutoMute の実適用は RTC controller 側に残し、この関数は視線イベント変換だけを担当する。
    characterGaze.arriveCallback = () => {
        debugConsoleManager.updateCharacterEyeStatus(true);
        if (dialogManager.getSetting("enableAutoMute")) {
            onMuteChange(false);
        }
    };
    characterGaze.leaveCallback = () => {
        debugConsoleManager.updateCharacterEyeStatus(false);
        if (dialogManager.getSetting("enableAutoMute")) {
            onMuteChange(true);
        }
    };
}
