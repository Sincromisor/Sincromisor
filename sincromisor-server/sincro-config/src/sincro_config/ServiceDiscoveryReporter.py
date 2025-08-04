import atexit
import logging
import random
import socket
import time
from logging import Logger
from threading import Thread
from typing import Any

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
        self.consul_host: str = consul_host
        self.consul_port: int = consul_port
        self.consul: Consul = Consul(host=self.consul_host, port=self.consul_port)
        self.public_bind_host: str = public_bind_host
        self.public_bind_port: int = public_bind_port
        self.ip_address: str = socket.gethostbyname(self.public_bind_host)
        self.worker_type: str = worker_type
        self.service_id: str = f"{self.worker_type}_{self.public_bind_host}_{self.ip_address}:{self.public_bind_port}"

    def run(self):
        while True:
            try:
                self.__check_register()
            except Exception as e:
                self.__logger.error(
                    f"Service registration error - consul: {self.consul_host}:{self.consul_port}, "
                    f"bind: {self.public_bind_host}({self.ip_address}):{self.public_bind_port}, {repr(e)}"
                )
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

    def __register(self) -> None:
        check: dict[str, Any] = Check.http(
            # JSONResponse({"sessions": セッション数(int)})
            # self.public_bind_hostを用いると、IPアドレスが変更された場合でも
            # 新ノード宛てとして名前解決できてしまい、checkがpassしてしまう
            f"http://{self.ip_address}:{self.public_bind_port}/api/v1/{self.worker_type}/statuses",
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
            address=self.ip_address,
            port=self.public_bind_port,
            check=check,
        )
        self.__reserve_deregister()
        self.__logger.info(
            f"Service {self.worker_type} registered with ID: {self.service_id}"
        )

    # consulにこのサービスが登録されているかを確認し、登録されていない場合は登録する
    def __check_register(self) -> None:
        services = self.consul.agent.services()
        # public_bind_hostとportが同じでIPアドレスが変わった場合、情報が更新されない問題がある点に注意
        if self.service_id not in services:
            self.__register()
        else:
            self.__logger.debug(
                f"Service {self.worker_type} already registered with ID: {self.service_id}"
            )

    # consulからこのサービスの情報を削除する
    def __deregister(self) -> None:
        self.consul.agent.service.deregister(service_id=self.service_id)
        self.__logger.info(
            f"Service {self.worker_type} deregistered with ID: {self.service_id}"
        )

    # プログラム終了時にconsulからこのサービスの情報を削除するよう予約する
    def __reserve_deregister(self) -> None:
        atexit.register(self.__deregister)
