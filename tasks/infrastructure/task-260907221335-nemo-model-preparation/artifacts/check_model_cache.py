"""配布イメージ内でNeMoの実際の取得境界を一時キャッシュで確認する。

取得APIだけを模擬する。実モデル展開は別途、通信無効のload_model()で確認する。
"""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from huggingface_hub import try_to_load_from_cache
from nemo.core.classes import common

resolve = common.Model._get_hf_hub_pretrained_model_info  # noqa: SLF001 -- 配布依存の実際のキャッシュ分岐を検証する。
repository = "reazon-research/reazonspeech-nemo-v2"
filename = "reazonspeech-nemo-v2.nemo"
with TemporaryDirectory() as directory:
    snapshot = Path(directory) / "models--reazon-research--reazonspeech-nemo-v2"
    model = snapshot / "snapshots/revision" / filename
    model.parent.mkdir(parents=True)
    (snapshot / "refs").mkdir()
    (snapshot / "refs/main").write_text("revision")
    api = Mock()
    api.file_exists.return_value = True
    api_factory = Mock(return_value=api)

    def download(**kwargs):
        """取得完了だけを模擬し、強制取得を要求していないことも確認する。"""
        assert kwargs["force_download"] is False
        model.write_bytes(b"completed-model")
        return str(model)

    fetch = Mock(side_effect=download)
    replacements = {
        "try_to_load_from_cache": lambda **kwargs: try_to_load_from_cache(
            **kwargs, cache_dir=directory
        ),
        "get_hf_token": lambda: None,
        "HfApi": api_factory,
        "hf_hub_download": fetch,
    }
    with patch.multiple(common, **replacements):
        assert resolve(repository)[1] == str(model)
        assert fetch.call_count == 1
        before = model.stat().st_mtime_ns
        api_factory.reset_mock()
        assert resolve(repository)[1] == str(model)
        api_factory.assert_not_called()
        assert fetch.call_count == 1
        assert model.stat().st_mtime_ns == before
        # 完了ファイルの欠損時は再取得する。途中ファイルだけでは完了とみなさない。
        model.unlink()
        model.with_suffix(".incomplete").write_bytes(b"partial")
        assert resolve(repository)[1] == str(model)
        assert fetch.call_count == 2
        model.unlink()
        fetch.side_effect = OSError("取得失敗の模擬")
        try:
            resolve(repository)
        except OSError:
            pass
        else:
            raise AssertionError("取得失敗が呼び出し元へ伝わらない")
        assert not model.exists()
        # 正常モデルがある場合は取得APIが失敗する状態でも再利用する。
        model.write_bytes(b"known-good-model")
        assert resolve(repository)[1] == str(model)
        assert model.read_bytes() == b"known-good-model"
print("MODEL_CACHE_BRANCHES_PASS")
