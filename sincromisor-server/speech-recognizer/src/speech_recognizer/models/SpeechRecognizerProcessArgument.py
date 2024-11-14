from argparse import ArgumentParser
from sincro_config import SincromisorArgumentParser


class SpeechRecognizerProcessArgument(SincromisorArgumentParser):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    redis_host: str
    redis_port: int
    log_file: str | None
    voice_log_dir: str | None

    @classmethod
    def argparse(cls, parser: ArgumentParser) -> None:
        super().set_args(parser=parser)

        default_bind_port: int = 8003

        cls.add_argument(
            parser=parser,
            cmd_name="--host",
            env_name="SINCRO_RECOGNIZER_HOST",
            default="127.0.0.1",
            help="Host to bind to(default: 127.0.0.1)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--port",
            env_name="SINCRO_RECOGNIZER_PORT",
            default=default_bind_port,
            help=f"Port to bind to(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-host",
            env_name="SINCRO_RECOGNIZER_PUBLIC_BIND_HOST",
            default=None,
            help="Public bind address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-port",
            env_name="SINCRO_RECOGNIZER_PUBLIC_BIND_PORT",
            default=default_bind_port,
            help=f"Public bind port(default: {default_bind_port})",
        )

        parser.add_argument(
            "--voice-log-dir",
            type=str,
            default=None,
            help="voice log directory path",
        )
        return
