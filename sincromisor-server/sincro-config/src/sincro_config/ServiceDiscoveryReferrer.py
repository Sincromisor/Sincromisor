import random
from collections.abc import Generator

from consul import Consul
from pydantic import BaseModel


class ServiceDescription(BaseModel):
    # consulの情報が更新された際に付与される連続した番号
    index: int
    # サービスの名称
    service_name: str
    # サービス内のワーカーに付与されたID
    service_id: str
    # ワーカーが待ち受けているIPアドレス
    service_address: str
    # ワーカーが待ち受けているポート番号
    service_port: int


class ServiceDiscoveryReferrer:
    def __init__(self, consul_agent_host: str, consul_agent_port: int):
        self.consul: Consul = Consul(host=consul_agent_host, port=consul_agent_port)

    # consulに登録されているサービスの一覧を返す。
    def __services(self) -> tuple[int, dict[str, list]]:
        return self.consul.catalog.services()

    # worker_typeで指定したサービスの情報を返す。
    def __service(self, worker_type: str) -> tuple[int, list]:
        return self.consul.catalog.service(worker_type)

    # worker_typeで指定したサービスのうち、
    # 正常稼働が確認できているものの情報を返す。
    def __healthy_service(self, worker_type: str) -> tuple[int, list]:
        return self.consul.health.service(worker_type, passing=True)

    # worker_typeで指定したサービスのワーカーのうち、
    # 正常稼働が確認できているものをランダムにひとつ返す。
    # どのワーカーも正常稼働していない場合はNoneを返す。
    def get_random_worker(self, worker_type: str) -> ServiceDescription | None:
        index: int
        workers: list
        index, workers = self.__healthy_service(worker_type=worker_type)
        if not workers:
            return None
        worker: dict = random.choice(workers)
        return ServiceDescription(
            index=index,
            service_name=worker_type,
            service_id=worker["Service"]["ID"],
            service_address=worker["Service"]["Address"],
            service_port=worker["Service"]["Port"],
        )

    # worker_typeで指定したサービスのワーカーすべてをGeneratorとして返す。
    def get_all_workers(
        self, worker_type: str
    ) -> Generator[ServiceDescription, None, None]:
        index: int
        workers: list
        worker: dict
        index, workers = self.__service(worker_type=worker_type)
        for worker in workers:
            yield ServiceDescription(
                index=index,
                service_name=worker["ServiceName"],
                service_id=worker["ServiceID"],
                service_address=worker["ServiceAddress"],
                service_port=worker["ServicePort"],
            )


if __name__ == "__main__":
    from pprint import pprint

    sdr = ServiceDiscoveryReferrer(consul_agent_host="127.0.0.1", consul_agent_port=8500)
    print("All workers:")
    for worker in sdr.get_all_workers("SpeechRecognizer"):
        pprint(worker)

    print("\nTarget worker:")
    pprint(sdr.get_random_worker("SpeechRecognizer"))
