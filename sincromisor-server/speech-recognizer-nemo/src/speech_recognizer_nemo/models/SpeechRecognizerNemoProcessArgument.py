from argparse import ArgumentParser

from sincro_config import SincromisorArgumentParser


class SpeechRecognizerNemoProcessArgument(SincromisorArgumentParser):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    s3_access_key: str | None
    s3_secret_key: str | None
    voice_log_dir: str | None
    proper_noun_enable: bool
    proper_noun_dict_path: str | None

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
            cmd_name="--s3-access-key",
            env_name="SINCRO_S3_ACCESS_KEY",
            default=None,
            help="S3 access key(default: None)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--s3-secret-key",
            env_name="SINCRO_S3_SECRET_KEY",
            default=None,
            help="S3 secret key(default: None)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--voice-log-dir",
            env_name="SINCRO_RECOGNIZER_VOICE_LOG_DIR",
            default=None,
            help="voice log directory path",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--proper-noun-enable",
            env_name="SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE",
            default=False,
            help="Enable proper noun dictionary loading(default: false)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--proper-noun-dict-path",
            env_name="SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH",
            default=None,
            help="Proper noun dictionary CSV path(default: None)",
        )
        return
