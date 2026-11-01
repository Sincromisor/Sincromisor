"""Mastraの本文増分を、数値と短い後続句を保つ音声合成単位へまとめる。"""

from collections.abc import Iterator

# 固定日本語の比較で、12文字では再生待ち、8文字では待ちなしで短句を削減できた。
# 後続の読点でだけ使い、文字数による単語途中の切断や句点での保留はしない。
MIN_FOLLOWING_PHRASE_LENGTH = 8


class SpeechPhrases:
    """一応答の保留本文を所有する。末尾の取出しは正常SSE終端後だけ行う。"""

    def __init__(self) -> None:
        """新しい応答の先頭句を待つ。接続や次の応答とは状態を共有しない。"""
        self.pending = ""
        self._position = 0
        self._first = True

    def feed(self, text: str) -> Iterator[str]:
        """受信境界に依存せず句を返す。数字直後の点・カンマは一文字先を待つ。"""
        self.pending += text
        while self._position < len(self.pending):
            index = self._position
            char = self.pending[index]
            if char in ".," and index > 0 and self.pending[index - 1].isdigit():
                if index + 1 == len(self.pending):
                    return
                if self.pending[index + 1].isdigit():
                    self._position += 1
                    continue
            self._position += 1
            if char not in "、。？！,.?!":
                continue
            phrase = self.pending[: self._position]
            # 先頭句は長さによらず渡すため、表情コードもそのまま共通モデルへ届く。
            if (
                char in "、,"
                and not self._first
                and len(phrase) < MIN_FOLLOWING_PHRASE_LENGTH
            ):
                continue
            self.pending = self.pending[self._position :]
            self._position = 0
            self._first = False
            yield phrase
