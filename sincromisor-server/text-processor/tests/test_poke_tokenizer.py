"""実Sudachiの旧呼出しと比較し、連続変換が既返却文字列を変更しないことを確認する。"""

import warnings

from sudachipy import Dictionary, SplitMode
from text_processor.PokeText.PokeText import PokeText


class PreviousTokenizer:
    def __init__(self):
        self.tokenizer = Dictionary(dict="full").tokenizer()

    def tokenize(self, text, *, out=None):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            return self.tokenizer.tokenize(text, mode=SplitMode.C)


def test_reuse_matches_previous_mode():
    previous, current = PokeText(), PokeText()
    previous.tokenizer = PreviousTokenizer()
    output = current.morphemes
    first = None
    for text in [
        "こんにちは。今日はいい天気ですね。",
        "ピカチュウがとても強くなった！",
        "",
        "次の文です",
    ]:
        result = current.convert(text)
        assert result == previous.convert(text)
        assert current.morphemes is output
        if first is None:
            first = result
            saved = list(first)
        assert first == saved
