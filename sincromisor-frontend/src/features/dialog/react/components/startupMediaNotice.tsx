import type { SincroAppSettingsSnapshot } from "../../../../app/controller";

/** 選択中の体験に応じた送信・保存先を、データ説明モーダルの本文へまとめる。 */
export function StartupMediaNotice({ settings }: { settings: SincroAppSettingsSnapshot }) {
    const recognizesSpeech = settings.talkMode === "chat" || settings.talkMode === "sincro";
    return (
        <div className="settingsPrimitiveFieldStack">
            <p className="settingsPrimitiveFieldDescription">
                音声を接続先サーバーへ送信します。
                {recognizesSpeech ? "認識した音声と文章はサーバーに保存されます。" : ""}
            </p>
            <ul>
                <li>
                    {recognizesSpeech
                        ? "音声を認識・応答・音声合成に使います。認識音声と認識結果を接続先に保存します。"
                        : "音声診断は認識・応答生成を使いません。折り返しでは送った入力を返し、サンプル再生では入力を再生に使いません。"}
                    {settings.talkMode === "chat" ? "会話履歴もサーバーに保存します。" : ""}
                </li>
                <li>
                    カメラ映像はブラウザー内で顔・視線・姿勢の追跡に使い、サーバーへ送りません。
                </li>
                <li>
                    選択したVRMと設定はこのブラウザーに保存します。VRMはサーバーへアップロードしません。
                </li>
            </ul>
        </div>
    );
}
