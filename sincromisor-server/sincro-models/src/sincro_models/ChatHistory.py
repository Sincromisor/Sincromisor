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


class ChatHistory(BaseModel):
    messages: list[ChatMessage] = []

    def last(self) -> ChatMessage | None:
        if self.messages:
            return self.messages[-1]
        return None

    def append(self, message: ChatMessage) -> None:
        self.messages.append(message)


if __name__ == "__main__":
    import msgpack

    def custom_pack(obj):
        if isinstance(obj, ChatHistory):
            return obj.model_dump()
        return obj

    def custom_unpack(obj):
        return obj

    history = ChatHistory()
    history.append(
        ChatMessage(
            message_type="user",
            speaker_id="gloria",
            speaker_name="Gloria",
            message="hello!",
        )
    )
    print(history.model_dump_json())

    pack = msgpack.packb(history, default=custom_pack)
    print(ChatHistory(**msgpack.unpackb(pack, object_hook=custom_unpack)))
