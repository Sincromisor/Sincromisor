import json

import requests

# API reference
# https://voicevox.github.io/voicevox_engine/api/


class VoiceVox:
    class ProtocolError(Exception):
        pass

    def __init__(self, host: str = "127.0.0.1", port: int = 50021):
        self.host = host
        self.port = port
        self.base_url = f"http://{self.host}:{self.port}"
        self.style_id_key: str = "speaker"  # speaker(deprecated)、style_id(新)。

    # テキストを+synthesis+に渡せるクエリJSON(連想配列)に変換。
    # * +text+ - クエリに変換するテキスト文字列。
    # * +speaker+ - 話者ID。+speakers+メソッドで得られる。(default: 1)
    # * 戻り値 - クエリ連想配列
    def audio_query(self, text: str, style_id: int = 1) -> dict:
        res = requests.post(
            f"{self.base_url}/audio_query",
            params={self.style_id_key: style_id, "text": text},
        )
        self.response_validator(res)
        return res.json()

    # テキストからアクセント句を生成。
    # * +text+ - アクセントに変換する文字列。
    # * +speaker+ - 話者ID。+speakers+メソッドで得られる。(default: 1)
    # * +is_kana+ - +text+がAquesTalkライクな記法に従う読み仮名であるか。(+audio_query+で得たkanaなどであればtrue。default: false)
    # 戻り値 - アクセント句配列
    #
    # ==== is_kanaがtrueの時の記法(AquesTalkライク記法)
    # * 全てのカナはカタカナで記述される。
    # * アクセント句は/または、で区切る。、で区切った場合に限り無音区間が挿入される。
    # * カナの手前に_を入れるとそのカナは無声化される。
    # * アクセント位置を'で指定する。全てのアクセント句にはアクセント位置を1つ指定する必要がある。
    # * アクセント句末に？(全角)を入れることにより疑問文の発音ができる。
    def accent_phrases(
        self, text: str, style_id: int = 1, is_kana: bool = False
    ) -> list:
        res = requests.post(
            f"{self.base_url}/accent_phrases",
            params={self.style_id_key: style_id, "text": text, "is_kana": is_kana},
        )
        self.response_validator(res)
        return res.json()

    # ++audio_query++メソッドなどで得たクエリを元に音声を生成。
    # * +query+ - 変換を要求するクエリ。
    # * +speaker+ - 話者ID。+speakers+メソッドで得られる。(default: 1)
    # * 戻り値 - wavストリーム
    def query_synthesis(self, query: dict, style_id: int = 1) -> bytes:
        res = requests.post(
            f"{self.base_url}/synthesis",
            params={self.style_id_key: style_id},
            headers={"Content-Type": "application/json"},
            data=json.dumps(query),
        )
        self.response_validator(res)
        return res.content

    # とにかくテキストを音声に変換する。
    # * +text+ - 音声に変換する文字列。
    # * +speaker+ - 話者ID。+speakers+メソッドで得られる。(default: 1)
    def synthesis(self, text: str, style_id: int = 1) -> bytes:
        query = self.audio_query(text, style_id)
        return self.query_synthesis(query, style_id)

    # ふたりの話者でモーフィングした音声を生成する。
    # (+base_speaker+で指定した話者の音声を、+target_sparker+で指定した話者のものに近づける。)
    # * +query+ - 変換を要求するクエリ。
    # * +base_speaker+ - ベースとなる話者のID。(default: 1)
    # * +target_speaker+ - ターゲットとなる話者のID。(default: 2)
    # * +morph_rate+ - どれだけターゲットに近づけるかを0.0～1.0で指定する。(default: 0.5)
    # * 戻り値 - wavストリーム
    def synthesis_morphing(
        self,
        query: dict,
        base_style_id: int = 1,
        target_style_id: int = 2,
        morph_rate: float = 0.5,
    ) -> bytes:
        res = requests.post(
            f"{self.base_url}/synthesis_morphing",
            params={
                f"base_{self.style_id_key}": base_style_id,
                f"target_{self.style_id_key}": target_style_id,
                "morph_rate": morph_rate,
            },
            headers={"Content-Type": "application/json"},
            data=json.dumps(query),
        )
        self.response_validator(res)
        return res.content

    # 話者の一覧を取得。
    # * 戻り値 - 話者一覧の配列。
    def speakers(self) -> list:
        res = requests.get(f"{self.base_url}/speakers")
        self.response_validator(res)
        return res.json()

    # 話者の追加情報を取得。
    # * +speaker_uuid+ - 話者のUUID。+speakers+メソッドで得られる...はず。
    # * 戻り値 - 話者の詳細情報の連想配列。
    def speaker_info(self, speaker_uuid: str) -> dict:
        res = requests.get(
            f"{self.base_url}/speaker_info",
            params={"speaker_uuid": speaker_uuid},
        )
        self.response_validator(res)
        return res.json()

    # サーバエンジンが保持しているプリセットを取得。
    # * 戻り値 - 配列
    def presets(self) -> list:
        res = requests.get(f"{self.base_url}/presets")
        self.response_validator(res)
        return res.json()

    # サーバのバージョンを取得。
    # 戻り値 - バージョン文字列
    def version(self) -> str:
        res = requests.get(f"{self.base_url}/version")
        self.response_validator(res)
        return res.json()

    # エンジンコアのバージョンを取得。
    # 戻り値 - バージョン文字列の配列
    def core_versions(self) -> list[str]:
        res = requests.get(f"{self.base_url}/core_versions")
        self.response_validator(res)
        return res.json()

    def response_validator(self, res: requests.Response) -> bool:
        if res.status_code == 200:
            return True
        else:
            raise self.ProtocolError(
                f"{res.status_code} {res.reason} - {res.request.url}"
            )

    def update_response_validator(self, res: requests.Response) -> bool:
        if res.status_code == 204:
            return True
        else:
            raise self.ProtocolError(
                f"{res.status_code} {res.reason} - {res.request.url}"
            )


if __name__ == "__main__":
    vv = VoiceVox(host="127.0.0.1", port=50021)
    # print(vv.version())
    # print(vv.speakers())
    print(vv.audio_query(style_id=1, text="こんにちは!"))
    with open("sample.wav", "wb") as wav:
        wav.write(vv.synthesis("こんにちは", style_id=0))
    # print(vv.speaker_info(speaker_uuid='7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff'))
