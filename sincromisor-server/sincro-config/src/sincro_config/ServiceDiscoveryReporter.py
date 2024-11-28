import atexit
import logging
import socket
from logging import Logger

from consul import Check, Consul


class ServiceDiscoveryReporter:
    def __init__(
        self,
        worker_type: str,
        consul_host: str,
        consul_port: int,
        public_bind_host: str,
        public_bind_port: int,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger(
            "sincro." + __name__ + f".{worker_type}",
        )
        self.consul: Consul = Consul(host=consul_host, port=consul_port)
        self.public_bind_host: str = public_bind_host
        self.public_bind_port: int = public_bind_port
        self.worker_type: str = worker_type
        self.service_id: str = (
            f"{self.worker_type}-{self.public_bind_host}:{self.public_bind_port}"
        )

    def register(self):
        check: Check = Check.http(
            # JSONResponse({"sessions": セッション数(int)})
            f"http://{self.public_bind_host}:{self.public_bind_port}/api/v1/statuses",
            # agentがチェックする間隔
            interval="10s",
            # agentからの接続タイムアウト
            timeout="5s",
            # criticalになってから自動的にderegisterされるまでの時間
            deregister="1m",
        )
        self.consul.agent.service.register(
            self.worker_type,
            service_id=self.service_id,
            # ここでホスト名をそのまま渡すと、consulのDNSサーバーが
            # リバースプロキシに解決できないcnameレコードを返してしまう。
            address=socket.gethostbyname(self.public_bind_host),
            port=self.public_bind_port,
            check=check,
        )
        self.__logger.info(
            f"Service {self.worker_type} registered with ID: {self.service_id}"
        )
        self.__reserve_deregister()

    def deregister(self):
        self.consul.agent.service.deregister(service_id=self.service_id)
        self.__logger.info(
            f"Service {self.worker_type} deregistered with ID: {self.service_id}"
        )

    def __reserve_deregister(self):
        atexit.register(self.deregister)
