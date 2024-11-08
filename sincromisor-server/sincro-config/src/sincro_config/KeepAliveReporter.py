import logging
from logging import Logger
from threading import Thread, Event
from redis import Redis, ConnectionError
import time


class KeepAliveReporter(Thread):
    # 現在のワーカーの状態を、下記のフォーマットでRedisに登録する。
    # この値を元に、AudioBrokerがワーカーにリクエストを投げる。
    # ワーカーが終了したらエントリーを削除するが、異常終了した際などに消せないこともある。
    #
    # フォーマット:
    # KeepAliveReporter.WorkerType: {
    #     "public_bind_host:public_bind_port": "time.time():connections"
    # }
    #
    # 実際の例:
    # "KeepAliveReporter.SpeechRecognizer": {
    #     "10.0.0.1:8001": "1730786925.0848029:1",
    #     "10.0.0.2:8001": "1730786930.0848029:4"
    # }
    #

    def __init__(
        self,
        event: Event,
        redis_host: str,
        redis_port: int,
        public_bind_host: str,
        public_bind_port: int,
        worker_type: str,
        interval: int = 5,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger(
            "sincro." + __name__ + f".{worker_type}"
        )
        self.redis_host: str = redis_host
        self.redis_port: int = redis_port
        self.event: Event = event
        self.public_bind_host: str = public_bind_host
        self.public_bind_port: int = public_bind_port
        self.worker_type: str = worker_type
        self.interval: int = interval
        self.count: int = 0

    def run(self) -> None:
        while True:
            try:
                self.__logger.info(
                    f"Keepalive reporter - connecting - {self.redis_host}:{self.redis_port}"
                )
                redis: Redis = Redis(host=self.redis_host, port=self.redis_port, db=1)
                self.__logger.info(f"Keepalive reporter - connected.")

                redis_key: str = f"KeepAliveReporter.{self.worker_type}"
                while not self.event.wait(self.interval):
                    redis.hset(
                        redis_key,
                        f"{self.public_bind_host}:{self.public_bind_port}",
                        f"{time.time()}:{self.count}",
                    )
                redis.hdel(
                    redis_key, f"{self.public_bind_host}:{self.public_bind_port}"
                )
                break
            except ConnectionError as e:
                self.__logger.error(f"Keepalive report failure - {repr(e)}")
            except Exception as e:
                self.__logger.error(f"Keepalive report failure - {repr(e)}")
            finally:
                try:
                    redis.hdel(
                        redis_key, f"{self.public_bind_host}:{self.public_bind_port}"
                    )
                except ConnectionError as e:
                    self.__logger.error(
                        f"Keepalive report finalize failure - {repr(e)}"
                    )
                except Exception as e:
                    self.__logger.error(
                        f"Keepalive report finalize failure - {repr(e)}"
                    )
                self.event.set()
                time.sleep(30)
        self.__logger.info("Keepalive reporter ended.")

    def set_count(self, count: int) -> int:
        self.count = count
        return self.count

    def countup(self) -> int:
        self.count += 1
        return self.count

    def countdown(self) -> int:
        self.count -= 1
        return self.count
