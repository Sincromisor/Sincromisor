import re

from sudachipy import Dictionary, Morpheme, MorphemeList, SplitMode, Tokenizer

# https://warp.da.ndl.go.jp/info:ndljp/pid/8703998/www.ndl.go.jp/jp/library/data/wakati.html


class PokeText:
    def __init__(self, debug=False):
        self.tokenizer: Tokenizer = Dictionary(dict="full").create()
        self.split_mode = SplitMode.C
        self.debug: bool = debug

    def convert(self, text: str) -> list[str]:
        result: MorphemeList = self.tokenizer.tokenize(text=text, mode=self.split_mode)
        text_buffer: str = ""
        i: int = 0
        while i < len(result):
            m: Morpheme = result[i]
            if self.debug:
                self.print(m)

            if i > 0:
                before_pos = result[i - 1].part_of_speech()
            else:
                before_pos = None

            current_pos = m.part_of_speech()

            match current_pos[0]:
                case "名詞":
                    # - 名詞が続く場合は分けずにひとかたまりにする
                    # - 接頭辞がある場合は、接頭辞の前で分け、その後ろの名詞では分けない
                    if (
                        not self.pos_check(before_pos, pos0="名詞")
                        and not self.pos_check(before_pos, pos0="副詞")
                        and not self.pos_check(before_pos, pos0="接頭辞")
                    ):
                        text_buffer += "\u3000"
                case "動詞":
                    # しかけ(動詞・一般) て(助詞) きた(動詞・非自立可能)
                    if (
                        not self.pos_check(before_pos, pos0="動詞")
                        and not self.pos_check(before_pos, pos0="副詞")
                        and not self.pos_check(before_pos, pos0="接頭辞")
                        and not self.pos_check(current_pos, pos1="非自立可能")
                    ):
                        text_buffer += "\u3000"
                case "形容詞":
                    if (
                        not self.pos_check(before_pos, pos0="副詞")
                        and not self.pos_check(before_pos, pos0="接頭辞")
                        and not self.pos_check(current_pos, pos1="非自立可能")
                    ):
                        text_buffer += "\u3000"
                case "副詞":
                    text_buffer += "\u3000"
                    count, same_pos_text = self.same_pos_count(ml=result, cur_idx=i)
                    if count > 0:
                        text_buffer += same_pos_text
                        i += count
                case "連体詞":
                    text_buffer += "\u3000"
                case "接頭辞":
                    text_buffer += "\u3000"

            text_buffer += m.surface()
            match current_pos[0]:
                case "補助記号":
                    count, same_pos_text = self.same_pos_count(ml=result, cur_idx=i)
                    if count > 0:
                        text_buffer += same_pos_text
                        i += count
                    text_buffer += "\u3000"
            i += 1
        if self.debug:
            print(f'"{text_buffer}"')
        return self.cleanup(text_buffer)

    def pos_check(
        self,
        target_pos: list | None,
        pos0: str | None = None,
        pos1: str | None = None,
        pos2: str | None = None,
    ) -> bool:
        if target_pos is None:
            return False
        if (
            (pos0 is None or target_pos[0] == pos0)
            and (pos1 is None or target_pos[1] == pos1)
            and (pos2 is None or target_pos[2] == pos2)
        ):
            return True
        return False

    # cur_idxの位置にある品詞と同じ品詞が続く回数と、継続している範囲のテキストをタプルで返す。
    # 例1: 副詞 -> 形容詞  = 0
    # 例2: 副詞 -> 副詞 -> 形容詞 = 1
    def same_pos_count(self, ml: MorphemeList, cur_idx: int) -> tuple[int, str]:
        ref_pos = ml[cur_idx].part_of_speech()
        i = 1
        text = ""  # ml[cur_idx].surface()
        while cur_idx + i < len(ml):
            if ref_pos[0] != ml[cur_idx + i].part_of_speech()[0]:
                break
            text += ml[cur_idx + i].surface()
            i += 1
        return (i - 1, text)

    def cleanup(self, text: str) -> list[str]:
        # \u3000 は全角スペース
        return list(
            filter(lambda x: not (x == "" or x == " "), re.split("\u3000+", text))
        )

    def print(self, m: Morpheme) -> None:
        print(
            [
                m.surface(),
                m.dictionary_form(),
                m.reading_form(),
                m.normalized_form(),
                m.part_of_speech(),
                m.is_oov(),
            ]
        )


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print(f"{sys.argv[0]} 変換するテキスト")
        sys.exit(1)
    poke_text = PokeText(debug=True)
    print(poke_text.convert(sys.argv[1]))
