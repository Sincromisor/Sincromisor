"""逐次合成の口形時刻を、固定Engineと同じ音素フレーム位置から求める。"""

import math

from sincro_models import VoiceSynthesizerMora, VoiceVoxMora, VoiceVoxQuery

# 固定Engineのtts_pipeline/tts_engine.pyと同じ24kHz/256の偶数丸めを使う。
# 出力48kHzでは1フレームが512サンプルとなり、区間の読取境界には依存しない。
_FRAME_RATE = 93.75


def _frames(seconds: float, speed: float) -> int:
    """速度補正後の音素長を偶数丸めし、外部クエリの負値・非有限値を拒否する。"""
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError("Invalid phoneme duration")
    return round(seconds / speed * _FRAME_RATE)


def _mora(
    mora: VoiceVoxMora, query: VoiceVoxQuery, *, pause: bool = False
) -> VoiceSynthesizerMora:
    """休止・速度の順に補正し、子音と母音を個別に丸めてから一モーラへまとめる。"""
    vowel_length = mora.vowel_length
    if mora.vowel == "pau":
        if query.pauseLength is not None:
            vowel_length = query.pauseLength
        vowel_length *= query.pauseLengthScale
    frames = _frames(vowel_length, query.speedScale)
    if mora.consonant_length is not None:
        frames += _frames(mora.consonant_length, query.speedScale)
    return VoiceSynthesizerMora(
        vowel=mora.vowel if mora.vowel_length and not pause else None,
        length=frames / _FRAME_RATE,
        text=None if pause else mora.text,
    )


def build_streaming_mora_queue(query: VoiceVoxQuery) -> list[VoiceSynthesizerMora]:
    """合成前に確定するサンプル位置を返す。完成WAVへの事後的な伸縮は行わない。

    Engineは前後無音・休止補正・速度・音素ごとの丸めを適用する。
    疑問文末尾の0.15秒の同母音延長は最後のモーラへ加え、テロップ先頭を再送しない。
    従来の完全音声APIの生クエリ時刻とは責務を分け、逐次会話でのみ使う。
    """
    if not math.isfinite(query.speedScale) or query.speedScale <= 0:
        raise ValueError("Invalid synthesis speed")
    result = [
        VoiceSynthesizerMora(
            length=_frames(query.prePhonemeLength, query.speedScale) / _FRAME_RATE
        )
    ]
    for phrase in query.accent_phrases:
        for mora in phrase.moras:
            result.append(_mora(mora, query))
        if phrase.is_interrogative and phrase.moras and phrase.moras[-1].pitch > 0:
            result[-1].length += _frames(0.15, query.speedScale) / _FRAME_RATE
        if phrase.pause_mora is not None:
            result.append(_mora(phrase.pause_mora, query, pause=True))
    result.append(
        VoiceSynthesizerMora(
            length=_frames(query.postPhonemeLength, query.speedScale) / _FRAME_RATE
        )
    )
    return result
