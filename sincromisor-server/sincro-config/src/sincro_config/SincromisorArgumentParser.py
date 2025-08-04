import os
from argparse import ArgumentParser
from typing import Self

from pydantic import BaseModel


class SincromisorArgumentParser(BaseModel):
    consul_agent_host: str | None
    consul_agent_port: int | None
    log_file: str | None

    @classmethod
    def description(cls) -> str:
        return cls.__name__

    @classmethod
    # defaultがNoneで必要な値の場合のみ、required=Trueにする
    def add_argument(
        cls,
        parser: ArgumentParser,
        cmd_name: str,
        env_name: str,
        help: str,
        default: str | int | float | None = None,
        required: bool = False,
    ) -> None:
        value: str | int | float | None = os.environ.get(env_name)
        if value is None and default is not None:
            value = default

        parser.add_argument(
            cmd_name,
            help=help,
            default=value,
            required=required and not bool(value),
        )

    @classmethod
    def set_args(cls, parser: ArgumentParser) -> None:
        cls.add_argument(
            parser=parser,
            cmd_name="--consul-agent-host",
            env_name="SINCRO_CONSUL_AGENT_HOST",
            default=None,
            help="Consul agent address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--consul-agent-port",
            env_name="SINCRO_CONSUL_AGENT_PORT",
            default=8500,
            help="Consul agent port(default: 8500)",
        )

        parser.add_argument(
            "--log-file",
            type=str,
            default=None,
            help="log file path(default: None(to stdout))",
        )
        return

    @classmethod
    def argparse(cls) -> Self:
        parser: ArgumentParser = ArgumentParser(description=cls.description())
        cls.set_args(parser=parser)
        return cls.model_validate(vars(parser.parse_args()))
