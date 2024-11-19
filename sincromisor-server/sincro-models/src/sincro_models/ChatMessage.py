import time

from pydantic import BaseModel, Field
from ulid import ULID


class ChatMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: str(ULID()))
    # system, error, reset, user - Chat UIでの表示に影響する。
    message_type: str
    # @systemのsystem部分 - ユーザーID。サインインなどに利用。@はつけない。
    speaker_id: str
    # Glorious AI - ユーザー名。UI上に表示されたりする。
    speaker_name: str
    message: str = ""
    created_at: float = Field(default_factory=time.time)
