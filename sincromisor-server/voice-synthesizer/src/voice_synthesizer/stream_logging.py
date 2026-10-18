"""逐次生成にも既存の取得元・時間・詳細ログ契約を適用し、本文は明示設定時だけ残す。"""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from time import perf_counter
from typing import TYPE_CHECKING

from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import VoiceSynthesizerRequest
from voice_synthesizer.voice_stream import StreamContext

if TYPE_CHECKING:
    from voice_synthesizer.VoiceSynthesizer.VoiceCacheManager import VoiceCacheManager


@contextmanager
def stream_log(
    manager: VoiceCacheManager, request: VoiceSynthesizerRequest, context: StreamContext
) -> Generator[None]:
    """要求単位の開始・終了を記録する。区間や口形を通常ログへ混ぜない。"""
    started = perf_counter()
    ids = context.ids
    manager.logger.info({"event": "synthesis_processing", **ids, "outcome": "started"})
    if manager.log_synthesis:
        manager.logger.info(
            {
                "event": "synthesis_request",
                **ids,
                "text": request.message,
                "parameters": request.model_dump(exclude={"message", "speech_id"}),
            }
        )
    try:
        yield
    except (Exception, GeneratorExit) as error:
        manager.logger.log(
            logging.WARNING,
            {
                "event": "synthesis_processing",
                **ids,
                "outcome": "cancelled"
                if isinstance(error, (GeneratorExit, InterruptedError))
                else "failed",
                "duration_ms": (perf_counter() - started) * 1000,
                "cache": context.cache_source,
                "stage": "synthesis",
                "peer": "voicevox"
                if context.cache_source == "generated"
                else context.cache_source,
                **failure_fields(error),
            },
        )
        raise
    if manager.log_synthesis and context.result is not None:
        result = context.result
        manager.logger.info(
            {
                "event": "synthesis_result",
                **ids,
                "text": result.message,
                "style_id": request.style_id,
                "audio_format": result.audio_format,
                "parameters": result.query.model_dump(
                    exclude={"accent_phrases", "kana"}
                ),
                "cache": context.cache_source,
                "outcome": "success",
                "query_time": perf_counter() - started,
                "speaking_time": result.speaking_time,
            }
        )
    manager.logger.info(
        {
            "event": "synthesis_processing",
            **ids,
            "outcome": "success",
            "cache": context.cache_source,
            "duration_ms": (perf_counter() - started) * 1000,
        }
    )
