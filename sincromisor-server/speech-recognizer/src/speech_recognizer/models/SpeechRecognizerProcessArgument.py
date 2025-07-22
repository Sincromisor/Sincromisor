from argparse import ArgumentParser

from sincro_config import SincromisorArgumentParser


class SpeechRecognizerProcessArgument(SincromisorArgumentParser):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    minio_access_key: str | None
    minio_secret_key: str | None
    voice_log_dir: str | None

    @classmethod
    def set_args(cls, parser: ArgumentParser) -> None:
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

        cls.add_argument(
            parser=parser,
            cmd_name="--minio-access-key",
            env_name="SINCRO_MINIO_ACCESS_KEY",
            default=None,
            help="MinIO access key(default: None)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--minio-secret-key",
            env_name="SINCRO_MINIO_SECRET_KEY",
            default=None,
            help="MinIO secret key(default: None)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--voice-log-dir",
            env_name="SINCRO_RECOGNIZER_VOICE_LOG_DIR",
            default=None,
            help="voice log directory path",
        )
        return
