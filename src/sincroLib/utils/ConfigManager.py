import yaml
import os
import random


class ConfigManager:
    config = None

    def __init__(self):
        if ConfigManager.config is None:
            print("Warning: ConfigManager is not initialized.")
            ConfigManager.load()

    def __getitem__(self, key: str):
        return ConfigManager.config[key]

    @classmethod
    def config_path(cls) -> str:
        if config_path := os.environ.get("SINCRO_CONF"):
            return config_path
        else:
            return "../config.yml"

    @classmethod
    def load(cls) -> None:
        ConfigManager.config = yaml.safe_load(open(cls.config_path()))

    def get_worker_conf(self, worker_id: int, type: str) -> dict:
        return ConfigManager.config["Worker"][type][worker_id]

    def get_random_worker_conf(self, type: str) -> dict:
        server_count: int = len(ConfigManager.config["Worker"][type])
        worker_id = random.randint(0, server_count - 1)
        return ConfigManager.config["Worker"][type][worker_id]

    def get_workers_conf(self, type: str):
        worker_id: int = 0
        for conf in ConfigManager.config["Worker"][type]:
            yield (worker_id, conf)
            worker_id += 1

    def get_launchable_workers_conf(self, type: str):
        worker_id: int = 0
        for conf in ConfigManager.config["Worker"][type]:
            if conf['launch']:
                yield (worker_id, conf)
            worker_id += 1

    # type: stun, turn
    def get_ice_servers_conf(self, server_type: str):
        for conf in ConfigManager.config["RTCIceServers"]:
            if conf["urls"][0:5] == f"{server_type}:":
                yield conf


if __name__ == "__main__":
    config = ConfigManager()
    print(config["VoiceSynthesizer"])
