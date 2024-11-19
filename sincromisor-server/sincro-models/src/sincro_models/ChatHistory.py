from pydantic import BaseModel

from .ChatMessage import ChatMessage


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
