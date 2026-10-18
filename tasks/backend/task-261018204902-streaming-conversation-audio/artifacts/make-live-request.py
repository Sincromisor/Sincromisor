"""実モデルで結合確認用の固定要求を生成する。音声や実際の会話は保存しない。"""

import sys
from pathlib import Path

from sincro_models import ChatHistory, ChatMessage, TextProcessorResult

text = (
    "音声の逐次再生を確認します。今日は静かな公園を歩きながら、これから作る庭について考えました。"
    "入り口には季節の花を植え、奥には小さな木陰と休憩できる場所を用意します。"
    "春は花の色を楽しみ、夏は涼しい風を感じ、秋には落ち葉を集めます。"
    "最後まで音声が完成する前に、この文章の最初の部分が聞こえることを確認しています。"
)
request = ChatMessage(
    speech_id=42,
    message_type="user",
    speaker_id="validation-user",
    speaker_name="検証者",
    message="音声を確認してください。",
)
response = ChatMessage(
    speech_id=42,
    message_type="assistant",
    speaker_id="validation-assistant",
    speaker_name="検証音声",
    message=text,
)
Path(sys.argv[1]).write_bytes(
    TextProcessorResult(
        session_id="streaming-live-validation",
        sequence_id=1,
        confirmed=True,
        history=ChatHistory(messages=[request]),
        request_message=request,
        response_message=response,
        end_of_response=True,
        voice_text=text,
    ).to_msgpack()
)
