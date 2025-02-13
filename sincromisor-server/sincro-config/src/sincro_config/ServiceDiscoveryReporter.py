import atexit
import logging
import random
import socket
import time
from logging import Logger
from threading import Thread

from consul import Check, Consul


class ServiceDiscoveryReporter(Thread):
    def __init__(
        self,
        worker_type: str,
        consul_host: str,
        consul_port: int,
        public_bind_host: str,
        public_bind_port: int,
    ):
        super().__init__(daemon=True)
        self.__logger: Logger = logging.getLogger(
            "sincro." + self.__class__.__name__ + f".{worker_type}",
        )
        self.consul: Consul = Consul(host=consul_host, port=consul_port)
        self.public_bind_host: str = public_bind_host
        self.public_bind_port: int = public_bind_port
        self.worker_type: str = worker_type
        self.service_id: str = (
            f"{self.worker_type}-{self.public_bind_host}:{self.public_bind_port}"
        )

    def run(self):
        while True:
            try:
                self.__check_register()
            except Exception as e:
                self.__logger.error(f"Service registration error - {repr(e)}")
            time.sleep(random.randint(5, 10))

    # consulのサービスカタログにこのサービスが登録されているかを確認する。
    # catalogには登録されているが、agentにない場合がある点に注意する。
    # (別のエージェントに登録されているサービスを参照する場合など)
    def check_register_catalog(self) -> bool:
        for svc_name in self.consul.catalog.services()[1]:
            for service in self.consul.catalog.service(svc_name)[1]:
                if service["ServiceID"] == self.service_id:
                    return True
        return False

    def __register(self):
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
        self.__reserve_deregister()
        self.__logger.info(
            f"Service {self.worker_type} registered with ID: {self.service_id}"
        )
        return

    # consulにこのサービスが登録されているかを確認し、登録されていない場合は登録する
    def __check_register(self):
        services = self.consul.agent.services()
        if self.service_id not in services:
            self.__register()
        else:
            self.__logger.debug(
                f"Service {self.worker_type} already registered with ID: {self.service_id}"
            )

    # consulからこのサービスの情報を削除する
    def __deregister(self):
        self.consul.agent.service.deregister(service_id=self.service_id)
        self.__logger.info(
            f"Service {self.worker_type} deregistered with ID: {self.service_id}"
        )

    # プログラム終了時にconsulからこのサービスの情報を削除するよう予約する
    def __reserve_deregister(self):
        atexit.register(self.__deregister)
