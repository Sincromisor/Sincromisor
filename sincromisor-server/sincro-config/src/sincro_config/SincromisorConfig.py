from pydantic import BaseModel, Field
from typing import List, Tuple, Optional, Generator
import yaml
import os
import random


class WorkerConfig(BaseModel):
    Host: str
    Port: int
    Url: str
    ForwardedAllowIps: Optional[str] = Field(None, alias="forwarded-allow-ips")
    Launch: bool


class RedisConfig(BaseModel):
    Host: str
    Port: int


class VoiceVoxConfig(BaseModel):
    Host: str
    Port: int


class RTCIceServerConfig(BaseModel):
    Urls: str
    UserName: str | None = None
    Credential: str | None = None


class WebRTCConfig(BaseModel):
    MaxSessions: int
    RTCIceServers: List[RTCIceServerConfig]


class VoiceSynthesizerConfig(BaseModel):
    EnableRedis: bool
    DefaultStyleID: int
    PrePhonemeLength: float
    PostPhonemeLength: float


class SincromisorConfig(BaseModel):
    ServerName: str
    VoiceSynthesizer: VoiceSynthesizerConfig
    Worker: dict[str, List[WorkerConfig]]
    Redis: List[RedisConfig]
    VoiceVox: List[VoiceVoxConfig]
    WebRTC: WebRTCConfig
    LogDirectory: str | None = None

    @classmethod
    def from_yaml(cls, filename: str | None = None) -> "SincromisorConfig":
        if filename is None:
            filename = cls.config_path()
        with open(filename, "r") as file:
            config_data = yaml.safe_load(file)
        return SincromisorConfig(**config_data)

    @classmethod
    def config_path(cls) -> str:
        if config_path := os.environ.get("SINCROMISOR_CONF"):
            return os.path.abspath(os.path.expanduser(config_path))
        else:
            return os.path.abspath("../config.yml")

    def get_worker_conf(self, worker_id: int, type: str) -> WorkerConfig:
        return self.Worker[type][worker_id]

    def get_random_worker_conf(self, type: str) -> WorkerConfig:
        server_count: int = len(self.Worker[type])
        worker_id = random.randint(0, server_count - 1)
        return self.Worker[type][worker_id]

    def get_workers_conf(
        self, type: str
    ) -> Generator[Tuple[int, WorkerConfig], None, None]:
        worker_id: int = 0
        for conf in self.Worker[type]:
            yield (worker_id, conf)
            worker_id += 1

    def get_launchable_workers_conf(
        self, type: str
    ) -> Generator[Tuple[int, WorkerConfig], None, None]:
        worker_id: int = 0
        for conf in self.Worker[type]:
            if conf.Launch:
                yield (worker_id, conf)
            worker_id += 1

    # type: stun, turn
    def get_ice_servers_conf(
        self, server_type: str
    ) -> Generator[RTCIceServerConfig, None, None]:
        for conf in self.WebRTC.RTCIceServers:
            if conf.Urls[0:5] == f"{server_type}:":
                yield conf

    def get_random_redis_conf(self) -> RedisConfig:
        server_count: int = len(self.Redis)
        worker_id = random.randint(0, server_count - 1)
        return self.Redis[worker_id]

    def get_random_voicevox_conf(self) -> VoiceVoxConfig:
        server_count: int = len(self.VoiceVox)
        worker_id = random.randint(0, server_count - 1)
        return self.VoiceVox[worker_id]

    def get_log_dir(self) -> str:
        if self.LogDirectory:
            return self.LogDirectory
        return os.path.join(os.getcwd(), "log")

    def get_log_path(self, type: str) -> str:
        return os.path.join(
            self.get_log_dir(), f"{type}.{self.get_current_worker_id()}.log"
        )

    def get_voice_log_dir(self) -> str:
        return os.path.join(self.get_log_dir(), "voice")

    def get_current_worker_id(self) -> int:
        if worker_id := os.environ.get("SINCROMISOR_WORKER_ID"):
            return int(worker_id)
        return 0


if __name__ == "__main__":
    from pprint import pprint

    config = SincromisorConfig.from_yaml()
    pprint(config)
    pprint(config.get_random_worker_conf("Sincromisor"))
    pprint(config.get_random_worker_conf("SpeechExtractor"))
    pprint(config.get_random_worker_conf("SpeechRecognizer"))
    pprint(config.get_random_worker_conf("VoiceSynthesizer"))
    pprint(config.Redis)
