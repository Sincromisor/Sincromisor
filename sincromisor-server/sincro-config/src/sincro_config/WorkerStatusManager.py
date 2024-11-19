import random
import time

from redis import Redis

from .WorkerStatus import WorkerStatus


class WorkerStatusManager:
    def __init__(self, redis_host: str = "127.0.0.1", redis_port: int = 6379):
        self.redis: Redis = Redis(
            host=redis_host,
            port=redis_port,
            db=1,
            decode_responses=True,
        )

    def all_worker_types(self) -> list[str]:
        return self.redis.keys("*")

    def workers(self, worker_type: str) -> dict:
        return self.redis.hgetall(f"KeepAliveReporter.{worker_type}")

    def active_workers(
        self,
        worker_type: str,
        threshold: int = 30,
    ) -> list[WorkerStatus]:
        result_workers = []
        current_t: float = time.time()
        all_workers: dict = self.workers(worker_type=worker_type)
        for key, value in all_workers.items():
            info: WorkerStatus = self.__parse(key, value)
            if info.last + threshold > current_t:
                result_workers.append(info)
        return result_workers

    def random_active_worker(
        self,
        worker_type: str,
        threshold: int = 30,
    ) -> WorkerStatus | None:
        return random.choice(
            self.active_workers(worker_type=worker_type, threshold=threshold),
        )

    def __parse(self, key: str, value: str) -> WorkerStatus:
        host, __port = key.split(":")
        __last, __count = value.split(":")
        port = int(__port)
        last = float(__last)
        count = int(__count)
        return WorkerStatus(host=host, port=port, last=last, count=count)


if __name__ == "__main__":
    wstat: WorkerStatusManager = WorkerStatusManager(
        redis_host="127.0.0.1",
        redis_port=6379,
    )
    print(wstat.all_worker_types())
    print(wstat.workers("SpeechRecognizer"))
    print(wstat.active_workers("SpeechRecognizer"))
    print(wstat.random_active_worker("SpeechRecognizer"))
