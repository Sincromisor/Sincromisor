import os
from collections.abc import Generator

import yaml
from pydantic import BaseModel

from .RTCIceServerConfig import RTCIceServerConfig
from .WebRTCConfig import WebRTCConfig


class SincromisorConfig(BaseModel):
    WebRTC: WebRTCConfig

    @classmethod
    def from_yaml(cls, filename: str | None = None) -> "SincromisorConfig":
        if filename is None:
            filename = cls.config_path()
        with open(filename) as file:
            config_data = yaml.safe_load(file)
        return SincromisorConfig(**config_data)

    @classmethod
    def config_path(cls) -> str:
        if config_path := os.environ.get("SINCROMISOR_CONF"):
            return os.path.abspath(os.path.expanduser(config_path))
        return os.path.abspath("../configs/config.yml")

    def get_all_ice_servers_conf(self) -> list[RTCIceServerConfig]:
        return self.WebRTC.RTCIceServers

    # server_type: stun, turn
    def get_ice_servers_conf(
        self,
        server_type: str,
    ) -> Generator[RTCIceServerConfig, None, None]:
        for conf in self.WebRTC.RTCIceServers:
            if conf.Urls[0:5] == f"{server_type}:":
                yield conf


if __name__ == "__main__":
    from pprint import pprint

    config = SincromisorConfig.from_yaml()
    pprint(config)
