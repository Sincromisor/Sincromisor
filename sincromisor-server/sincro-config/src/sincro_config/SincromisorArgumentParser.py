import os
from argparse import ArgumentParser

from pydantic import BaseModel


class SincromisorArgumentParser(BaseModel):
    @classmethod
    def description(cls) -> str:
        return cls.__name__

    @classmethod
    def add_argument(
        cls,
        parser: ArgumentParser,
        cmd_name: str,
        env_name: str,
        help: str,
        default: str | int | float | None = None,
    ) -> None:
        value: str | None = os.environ.get(env_name)
        if value is None and default is not None:
            value = default

        parser.add_argument(
            cmd_name, help=help, default=value, required=not bool(value)
        )
        pass

    @classmethod
    def set_args(cls, parser: ArgumentParser) -> None:
        cls.add_argument(
            parser=parser,
            cmd_name="--redis-host",
            env_name="SINCRO_REDIS_HOST",
            default=None,
            help="Redis address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--redis-port",
            env_name="SINCRO_REDIS_PORT",
            default=6379,
            help="Redis port(default: 6379)",
        )

        parser.add_argument(
            "--log-file",
            type=str,
            default=None,
            help="log file path(default: None(to stdout))",
        )
        return

    @classmethod
    def argparse(cls) -> "SincromisorArgumentParser":
        parser: ArgumentParser = ArgumentParser(description=cls.description())
        cls.set_args(parser=parser)
        return cls.model_validate(vars(parser.parse_args()))
