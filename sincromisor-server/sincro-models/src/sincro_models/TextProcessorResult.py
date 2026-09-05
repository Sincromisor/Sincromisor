"""テキスト処理からGoと音声合成へ渡す共通結果を定義し、本文増分と確定履歴を保持する。"""

from typing import Any

import msgpack
from pydantic import BaseModel, PrivateAttr

from .ChatHistory import ChatHistory, ChatMessage
from .TextProcessorRequest import TextProcessorRequest


class TextProcessorResult(BaseModel):
    """テキスト処理の途中応答と、最後に確定する会話履歴を表す。"""

    # セッションのID。接続している間は同じ値となる。
    session_id: str
    # SpeechExtractorResultを送信するごとに割り振られるID。    sequence_id: int = 0
    sequence_id: int = 0
    # 発話が(request_messageの生成が)完了していたらTrue、
    # 未完了ならFalse。
    confirmed: bool = False
    # 会話履歴
    # request, resposeがそれぞれ確定した時点で更新される
    history: ChatHistory
    request_message: ChatMessage
    response_message: ChatMessage
    end_of_response: bool = False
    # VoiceSynthesizerで読み上げるテキスト。
    # 「こんにちは。今日もいい天気ですね。」なら
    # 「こんにちは」と「今日もいい天気ですね」がそれぞれtextに入る。
    # 一度VoiceSynthesizerに送ったら、同じテキストは再送しない。
    voice_text: str | None = None
    # ストリーミング応答先頭の ^N をチャンク跨ぎで安全に剥がすための内部状態。
    _response_prefix_checked: bool = PrivateAttr(default=False)
    _response_prefix_buffer: str = PrivateAttr(default="")

    def append_response_message(self, text: str) -> bool:
        """本文断片を追加し、送信可能な音声入力ができたかを返す。"""
        # 応答ストリーム先頭の ^N 感情コードをここで剥がす。
        # text_ch 表示文と voice_text(TTS入力)の両方から制御文字を除去するため、
        # TextProcessorWorker個別実装ではなく共有モデル側で一元処理する。
        visible_text = self.__consume_expression_prefix(text)
        if not visible_text:
            # ^ のみ / ^N のみを受け取ったチャンクでは、まだ可視文字がないため
            # 中間レスポンス送信をスキップできるよう False を返す。
            self.voice_text = None
            return False
        self.response_message.message += visible_text
        self.voice_text = visible_text
        return True

    def finalize(self) -> None:
        """正常終了時に保留本文と履歴を確定する。呼び出し元は一応答につき一度だけ呼ぶ。

        未送信の単独「^」が残る場合は最終結果の音声入力にも載せる。
        それ以外は音声入力を空にし、直前の増分を再送しない。
        """
        # ^ のみで終了する等の異常系でも、本文文字を欠落させない。
        if not self._response_prefix_checked and self._response_prefix_buffer:
            self.response_message.message += self._response_prefix_buffer
            self.voice_text = self._response_prefix_buffer
            self._response_prefix_buffer = ""
            self._response_prefix_checked = True
        else:
            self.voice_text = None
        self.end_of_response = True
        self.history.messages.append(self.response_message)

    def __consume_expression_prefix(self, text: str) -> str:
        if self._response_prefix_checked:
            return text

        # Dify等の streaming では "^" と "1" が別チャンクになることがあるため、
        # 先頭2文字が確定するまで内部バッファで保留する。
        self._response_prefix_buffer += text
        if self._response_prefix_buffer == "":
            return ""

        if not self._response_prefix_buffer.startswith("^"):
            visible_text = self._response_prefix_buffer
            self._response_prefix_buffer = ""
            self._response_prefix_checked = True
            return visible_text

        # 先頭1文字しか来ていない場合は次チャンクを待つ。
        if len(self._response_prefix_buffer) < 2:
            return ""

        code_char = self._response_prefix_buffer[1]
        if code_char in "012345":
            # ChatMessageへ感情コードを載せることで、text_chの既存経路を維持したまま
            # フロントが表情を切り替えられるようにする。
            self.response_message.expression_code = int(code_char)
            visible_text = self._response_prefix_buffer[2:]
            self._response_prefix_buffer = ""
            self._response_prefix_checked = True
            return visible_text

        # ^N 形式でない場合は本文としてそのまま扱う。
        visible_text = self._response_prefix_buffer
        self._response_prefix_buffer = ""
        self._response_prefix_checked = True
        return visible_text

    @classmethod
    def from_request(
        cls,
        request: TextProcessorRequest,
        message_type: str,
        speaker_id: str,
        speaker_name: str,
    ) -> "TextProcessorResult":
        """要求の会話情報を引き継ぎ、空の応答結果を作る。"""
        return TextProcessorResult(
            session_id=request.session_id,
            sequence_id=request.sequence_id,
            confirmed=request.confirmed,
            history=request.history,
            request_message=request.request_message,
            response_message=ChatMessage(
                speech_id=request.request_message.speech_id,
                message_type=message_type,
                speaker_id=speaker_id,
                speaker_name=speaker_name,
            ),
            end_of_response=False,
            voice_text=None,
        )

    @classmethod
    def from_msgpack(cls, pack: bytes) -> "TextProcessorResult":
        """下流へ渡されたMessagePackを復号し、モデルの型と必須項目を検証する。

        不正なMessagePackやモデル検証の失敗は呼び出し元へ伝える。
        """
        contents = msgpack.unpackb(pack)
        return TextProcessorResult(**contents)

    def __msgpack_pack(self, obj):
        """入れ子の履歴・メッセージだけを既存の公開フィールド辞書へ変換する。"""
        if isinstance(obj, ChatHistory):
            return obj.model_dump()
        if isinstance(obj, ChatMessage):
            return obj.model_dump()
        return obj

    def to_msgpack(self) -> bytes:
        """Goと音声合成が共有する既存フィールドをMessagePackへ符号化する。

        感情コード解析用のPrivateAttrは内部状態であり通信には含めない。
        呼び出した時点の本文・音声増分・履歴を固定したバイト列を返す。
        """
        pack: Any | None = msgpack.packb(
            {
                "session_id": self.session_id,
                "sequence_id": self.sequence_id,
                "confirmed": self.confirmed,
                "history": self.history,
                "request_message": self.request_message,
                "response_message": self.response_message,
                "end_of_response": self.end_of_response,
                "voice_text": self.voice_text,
            },
            default=self.__msgpack_pack,
        )
        assert isinstance(pack, bytes), "msgpack.packb returned non-bytes"
        return pack

    """
    def to_json(self) -> str:
        return json.dumps(
            {
                "session_id": self.session_id,
                "speech_id": self.speech_id,
                "sequence_id": self.sequence_id,
                "confirmed": self.confirmed,
                "history": self.history,
                "request_message": self.request_message,
                "response_message": self.response_message,
                "end_of_response": self.end_of_response,
                "voice_text": self.voice_text,
            },
            ensure_ascii=False,
        )
    """
