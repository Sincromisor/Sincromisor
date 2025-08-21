import wave

import numpy as np
from speech_recognizer.SpeechRecognizer import SpeechRecognizer

s2t: SpeechRecognizer = SpeechRecognizer(
    decode_options={"max_new_tokens": 255},
)

# 1ch, s16le, 16000Hz
# 音声の前後に1s程度の無音が必要。
# ffmpeg -i source.wav -ar 16000 -ac 1 sample.wav
with wave.open("sample.wav", "rb") as wav:
    frames = wav.readframes(wav.getnframes())
    inputs, outputs = s2t.transcribe(
        np.frombuffer(frames, dtype=np.int16),
        decode_options={
            "output_scores": True,
            "return_dict_in_generate": True,
            "max_new_tokens": 500,
        },
    )
    print("Inputs:", inputs)
    print("Outputs:", outputs)
    print("\nDecoded text:")
    for token, score in s2t.transcribe_with_score(inputs, outputs):
        print(f'    {score:.5f}: "{token}"')

"""
Decoded text:
    0.92252: "おはよう"
    0.99892: "ご"
    0.99997: "ざい"
    0.99989: "ます"
    0.58701: "今日"
    0.99992: "も"
    0.99675: "いい"
    0.99495: "天気"
    0.99997: "です"
    0.99996: "ね"
    0.99780: "。"
    0.99991: "</s>"
"""
