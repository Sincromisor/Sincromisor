"""合成に使ったVOICEVOXクエリから口形列を作る。通信と音声生成は扱わない。"""

from sincro_models import VoiceSynthesizerMora, VoiceVoxMora, VoiceVoxQuery


def build_mora_queue(query: VoiceVoxQuery) -> list[VoiceSynthesizerMora]:
    """クエリを変更せず、前無音・各句・後無音の順に継続秒数を並べる。

    各長さはクエリの値を使い、WAVの実時間への補正は行わない。
    休止と前後の無音は、口形もテキストも表示しない区間として返す。
    """
    result = [VoiceSynthesizerMora(length=query.prePhonemeLength)]
    for phrase in query.accent_phrases:
        result.extend(_convert_mora(mora) for mora in phrase.moras)
        if phrase.pause_mora is not None:
            result.append(_convert_mora(phrase.pause_mora, pause=True))
    result.append(VoiceSynthesizerMora(length=query.postPhonemeLength))
    return result


def _convert_mora(mora: VoiceVoxMora, *, pause: bool = False) -> VoiceSynthesizerMora:
    """子音と母音を一つの区間へまとめ、母音長ゼロでは口形を表示しない。"""
    return VoiceSynthesizerMora(
        vowel=mora.vowel if mora.vowel_length and not pause else None,
        length=mora.vowel_length + (mora.consonant_length or 0.0),
        text=None if pause else mora.text,
    )
