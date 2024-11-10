from pydantic import BaseModel
from argparse import ArgumentParser, Namespace


class TextProcessorProcessArgument(BaseModel):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    redis_host: str
    redis_port: int
    log_file: str | None

    @classmethod
    def __argparse(cls) -> Namespace:
        parser = ArgumentParser(
            description="Start the FastAPI application with custom options."
        )
        parser.add_argument(
            "--host",
            type=str,
            default="127.0.0.1",
            help="Host to bind to(default: 127.0.0.1)",
        )
        parser.add_argument(
            "--port", type=int, default=8006, help="Port to bind to(default: 8006)"
        )
        parser.add_argument(
            "--public-bind-host", type=str, help="Public bind address", required=True
        )
        parser.add_argument(
            "--public-bind-port",
            type=int,
            default=8006,
            help="Public bind port(default: 8006)",
        )
        parser.add_argument(
            "--redis-host",
            type=str,
            help="Redis address",
            required=True,
        )
        parser.add_argument(
            "--redis-port", type=int, default=6379, help="Redis port(default: 6379)"
        )
        parser.add_argument(
            "--log-file",
            type=str,
            default=None,
            help="log file path(default: None(to stdout))",
        )
        args: Namespace = parser.parse_args()
        return args

    @classmethod
    def argparse(cls) -> "TextProcessorProcessArgument":
        return cls.model_validate(vars(cls.__argparse()))
