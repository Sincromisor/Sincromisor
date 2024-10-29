from pydantic import BaseModel, ConfigDict
import numpy as np
import json


class VoiceSynthesizerResultFrame(BaseModel):
    # np.ndarrayがメンバにいるとコケる問題対策
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # 発話開始時からの経過時間
    # (このフレームが開始するまでのlengthの累計)
    timestamp: float
    # このフレームを含む音声のテキスト全体
    # 例: 'はい。'
    message: str
    # 母音(無音の時はNone)
    # 例: 'a'
    vowel: str | None
    # 発話しているテキスト(無音の時はNone)
    # 例: 'は'
    # ひとつのテキストに対し、複数のフレームが含まれることがある。
    text: str | None
    # このフレームを含むテキストの音声の長さ
    # (このフレームの長さではない)
    length: float
    # 新たに発話が開始されたテキストか
    new_text: bool
    # 音声フレーム本体
    vframe: np.ndarray

    def params_to_json(self) -> str:
        return json.dumps(
            {
                "timestamp": self.timestamp,
                "message": self.message,
                "vowel": self.vowel,
                "text": self.text,
                "length": self.length,
                "new_text": self.new_text,
            },
            ensure_ascii=False,
        )


# {"vowel": "a", "length": 0.2224036306142807, "text": "ハ"}
