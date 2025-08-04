from pydantic import BaseModel


class VoiceVoxMora(BaseModel):
    text: str
    consonant: str | None
    consonant_length: float | None
    vowel: str
    vowel_length: float
    pitch: float


class VoiceVoxAccentPhrase(BaseModel):
    moras: list[VoiceVoxMora]
    accent: int
    pause_mora: VoiceVoxMora | None
    is_interrogative: bool


class VoiceVoxQuery(BaseModel):
    accent_phrases: list[VoiceVoxAccentPhrase]
    speedScale: float
    pitchScale: float
    intonationScale: float
    volumeScale: float
    prePhonemeLength: float
    postPhonemeLength: float
    pauseLength: float | None
    pauseLengthScale: float
    outputSamplingRate: int
    outputStereo: bool
    kana: str


if __name__ == "__main__":
    sample_query = {
        "accent_phrases": [
            {
                "moras": [
                    {
                        "text": "コ",
                        "consonant": "k",
                        "consonant_length": 0.10002632439136505,
                        "vowel": "o",
                        "vowel_length": 0.15740256011486053,
                        "pitch": 5.746926307678223,
                    },
                    {
                        "text": "ン",
                        "consonant": None,
                        "consonant_length": None,
                        "vowel": "N",
                        "vowel_length": 0.08265873789787292,
                        "pitch": 5.900725841522217,
                    },
                    {
                        "text": "ニ",
                        "consonant": "n",
                        "consonant_length": 0.03657080978155136,
                        "vowel": "i",
                        "vowel_length": 0.11733459681272507,
                        "pitch": 5.993741512298584,
                    },
                    {
                        "text": "チ",
                        "consonant": "ch",
                        "consonant_length": 0.08907029777765274,
                        "vowel": "i",
                        "vowel_length": 0.08295207470655441,
                        "pitch": 5.9776225090026855,
                    },
                    {
                        "text": "ワ",
                        "consonant": "w",
                        "consonant_length": 0.07414374500513077,
                        "vowel": "a",
                        "vowel_length": 0.17916648089885712,
                        "pitch": 5.957456111907959,
                    },
                ],
                "accent": 5,
                "pause_mora": {
                    "text": "、",
                    "consonant": None,
                    "consonant_length": None,
                    "vowel": "pau",
                    "vowel_length": 0.35231050848960876,
                    "pitch": 0,
                },
                "is_interrogative": False,
            },
            {
                "moras": [
                    {
                        "text": "キョ",
                        "consonant": "ky",
                        "consonant_length": 0.15087446570396423,
                        "vowel": "o",
                        "vowel_length": 0.11085230857133865,
                        "pitch": 6.039365768432617,
                    },
                    {
                        "text": "オ",
                        "consonant": None,
                        "consonant_length": None,
                        "vowel": "o",
                        "vowel_length": 0.102527916431427,
                        "pitch": 6.1188063621521,
                    },
                    {
                        "text": "ワ",
                        "consonant": "w",
                        "consonant_length": 0.06807997822761536,
                        "vowel": "a",
                        "vowel_length": 0.09563785046339035,
                        "pitch": 5.805655002593994,
                    },
                ],
                "accent": 1,
                "pause_mora": None,
                "is_interrogative": False,
            },
            {
                "moras": [
                    {
                        "text": "ア",
                        "consonant": None,
                        "consonant_length": None,
                        "vowel": "a",
                        "vowel_length": 0.12384802848100662,
                        "pitch": 5.457581996917725,
                    },
                    {
                        "text": "ツ",
                        "consonant": "ts",
                        "consonant_length": 0.11686449497938156,
                        "vowel": "u",
                        "vowel_length": 0.08002760261297226,
                        "pitch": 5.920149803161621,
                    },
                    {
                        "text": "イ",
                        "consonant": None,
                        "consonant_length": None,
                        "vowel": "i",
                        "vowel_length": 0.08827117085456848,
                        "pitch": 6.089973449707031,
                    },
                    {
                        "text": "デ",
                        "consonant": "d",
                        "consonant_length": 0.05048421770334244,
                        "vowel": "e",
                        "vowel_length": 0.11751953512430191,
                        "pitch": 6.095798492431641,
                    },
                    {
                        "text": "ス",
                        "consonant": "s",
                        "consonant_length": 0.04673375189304352,
                        "vowel": "U",
                        "vowel_length": 0.0776565745472908,
                        "pitch": 0,
                    },
                    {
                        "text": "ネ",
                        "consonant": "n",
                        "consonant_length": 0.06366991251707077,
                        "vowel": "e",
                        "vowel_length": 0.26965707540512085,
                        "pitch": 5.866387367248535,
                    },
                ],
                "accent": 2,
                "pause_mora": None,
                "is_interrogative": False,
            },
        ],
        "speedScale": 1,
        "pitchScale": 0,
        "intonationScale": 1,
        "volumeScale": 1,
        "prePhonemeLength": 0.1,
        "postPhonemeLength": 0.1,
        "pauseLength": None,
        "pauseLengthScale": 1,
        "outputSamplingRate": 24000,
        "outputStereo": False,
        "kana": "コンニチワ'、キョ'オワ/アツ'イデ_スネ",
    }
    query = VoiceVoxQuery.model_validate(sample_query)
    print(query.model_dump_json(indent=4))
