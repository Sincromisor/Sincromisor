from argparse import ArgumentParser
from sincro_config import SincromisorArgumentParser


class TextProcessorProcessArgument(SincromisorArgumentParser):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    redis_host: str
    redis_port: int
    log_file: str | None
    dify_url: str | None
    dify_token: str | None

    @classmethod
    def argparse(cls, parser: ArgumentParser) -> None:
        super().set_args(parser=parser)

        default_bind_port: int = 8006

        cls.add_argument(
            parser=parser,
            cmd_name="--host",
            env_name="SINCRO_PROCESSOR_HOST",
            default="127.0.0.1",
            help="Host to bind to(default: 127.0.0.1)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--port",
            env_name="SINCRO_PROCESSOR_PORT",
            default=default_bind_port,
            help=f"Port to bind to(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-host",
            env_name="SINCRO_PROCESSOR_PUBLIC_BIND_HOST",
            default=None,
            help="Public bind address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-port",
            env_name="SINCRO_PROCESSOR_PUBLIC_BIND_PORT",
            default=default_bind_port,
            help=f"Public bind port(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--dify-url",
            env_name="SINCRO_PROCESSOR_DIFY_URL",
            default=None,
            help="Dify URL(default: None)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--dify-token",
            env_name="SINCRO_PROCESSOR_DIFY_TOKEN",
            default=None,
            help="Dify access token(default: None)",
        )

        return
