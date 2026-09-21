import atexit
import logging
import socket
import time
from logging import Logger
from threading import Thread
from typing import Any

from consul import Check, Consul

from .runtime_diagnostics import failure_fields


class ServiceDiscoveryReporter(Thread):
    """Consul登録を30秒ごとに更新し、失敗しても次の周期に再試行する。"""

    def __init__(
        self,
        worker_type: str,
        consul_host: str,
        consul_port: int,
        public_bind_host: str,
        public_bind_port: int,
    ) -> None:
        """登録先と公開側の設定を保持する。資格情報や接続例外の本文はログへ出さない。"""
        super().__init__(daemon=True)
        self.__logger: Logger = logging.getLogger(
            "sincro." + self.__class__.__name__ + f".{worker_type}",
        )
        self.__consul_host: str = consul_host
        self.__consul_port: int = consul_port
        self.__consul: Consul = Consul(host=self.__consul_host, port=self.__consul_port)
        self.__public_bind_host: str = public_bind_host
        self.__public_bind_port: int = public_bind_port
        self.__worker_type: str = worker_type

    # 30秒程度に1回、consulにサービス情報を登録する。
    # 設定した死活監視が失敗した場合、一定時間で自動的にderegisterされる。
    def run(self) -> None:
        while True:
            try:
                self.__register()
            except Exception as error:  # noqa: BLE001 - 常駐登録と終了時解除は未知の障害でも次の周期・終了を妨げない。
                self.__logger.warning(
                    {
                        "event": "service_discovery",
                        "peer": "consul",
                        "target_service": self.__worker_type,
                        "stage": "register",
                        "outcome": "failed",
                        **failure_fields(error),
                    }
                )
            time.sleep(30)

    def __register(self) -> None:
        """現在IPを登録し、成功した場合だけ終了時の解除を予約する。"""
        self.__logger.info(
            {
                "event": "service_discovery",
                "peer": "consul",
                "target_service": self.__worker_type,
                "stage": "register",
                "outcome": "started",
            }
        )
        new_ip_address: str = self.__ip_address()
        new_service_id: str = self.__service_id()

        check: dict[str, Any] = Check.http(
            # JSONResponse({"sessions": セッション数(int)})
            # self.public_bind_hostを用いると、IPアドレスが変更された場合でも
            # 新ノード宛てとして名前解決できてしまい、checkがpassしてしまう
            f"http://{new_ip_address}:{self.__public_bind_port}/api/v1/{self.__worker_type}/statuses",
            # agentがチェックする間隔
            interval="10s",
            # agentからの接続タイムアウト
            timeout="5s",
            # criticalになってから自動的にderegisterされるまでの時間
            deregister="10m",
        )

        self.__consul.agent.service.register(
            self.__worker_type,
            service_id=new_service_id,
            # ここでホスト名をそのまま渡すと、consulのDNSサーバーが
            # リバースプロキシに解決できないcnameレコードを返してしまう。
            address=new_ip_address,
            port=self.__public_bind_port,
            check=check,
        )
        self.__reserve_deregister(new_service_id)
        self.__logger.info(
            {
                "event": "service_discovery",
                "peer": "consul",
                "target_service": self.__worker_type,
                "stage": "register",
                "outcome": "success",
            }
        )

    # consulからこのサービスの情報を削除する
    # register時にderegisterを指定して自動削除するようにしているので、失敗しても差し支えない
    def __deregister(self, target_service_id: str) -> None:
        try:
            self.__consul.agent.service.deregister(service_id=target_service_id)
        except Exception as error:  # noqa: BLE001 - 常駐登録と終了時解除は未知の障害でも次の周期・終了を妨げない。
            # Consul側にも解除期限があるため終了を妨げず、失敗の分類を残す。
            self.__logger.warning(
                {
                    "event": "service_discovery",
                    "peer": "consul",
                    "target_service": self.__worker_type,
                    "stage": "deregister",
                    "outcome": "failed",
                    **failure_fields(error),
                }
            )
        else:
            self.__logger.info(
                {
                    "event": "service_discovery",
                    "peer": "consul",
                    "target_service": self.__worker_type,
                    "stage": "deregister",
                    "outcome": "success",
                }
            )

    # プログラム終了時にconsulからこのサービスの情報を削除するよう予約する
    # register時にderegisterを指定して自動削除するようにしているので、失敗しても差し支えない
    def __reserve_deregister(self, target_service_id: str) -> None:
        atexit.register(self.__deregister, target_service_id)

    def __ip_address(self) -> str:
        return socket.gethostbyname(self.__public_bind_host)

    def __service_id(self) -> str:
        return f"{self.__worker_type}_{self.__public_bind_host}_{self.__ip_address()}:{self.__public_bind_port}"
