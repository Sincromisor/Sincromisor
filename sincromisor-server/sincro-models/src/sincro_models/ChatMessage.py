import time

from pydantic import BaseModel, Field
from ulid import ULID


class ChatMessage(BaseModel):
    # ユーザーの発話ごとに割り振られるID。
    # 最初の音声検知時に割り当てられ、
    # 発話が完了する(confirmedがTrueとなる)まで維持される。
    speech_id: int

    # メッセージごとに個別に付与されるID。
    # 対話の場合、speech_idひとつにつき、リクエストと
    # レスポンスのふたつのメッセージが生成される。
    message_id: str = Field(default_factory=lambda: str(ULID()))
    # system, error, reset, user - Chat UIでの表示に影響する。
    message_type: str
    # @systemのsystem部分 - ユーザーID。サインインなどに利用。@はつけない。
    speaker_id: str
    # Glorious AI - ユーザー名。UI上に表示されたりする。
    speaker_name: str
    # 応答文先頭の ^N 形式から抽出した感情コード（0-5）。
    # 未指定/未抽出時はNone。フロント側の表情制御ヒントとして使う。
    expression_code: int | None = None
    message: str = ""
    created_at: float = Field(default_factory=time.time)
