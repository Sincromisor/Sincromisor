from argparse import ArgumentParser
from sincro_config import SincromisorArgumentParser


class VoiceSynthesizerProcessArgument(SincromisorArgumentParser):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    redis_host: str
    redis_port: int
    voicevox_host: str
    voicevox_port: int
    voicevox_default_style_id: int
    log_file: str | None

    @classmethod
    def set_args(cls, parser: ArgumentParser) -> None:
        super().set_args(parser=parser)

        default_bind_port: int = 8005

        cls.add_argument(
            parser=parser,
            cmd_name="--host",
            env_name="SINCRO_SYNTHESIZER_HOST",
            default="127.0.0.1",
            help="Host to bind to(default: 127.0.0.1)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--port",
            env_name="SINCRO_SYNTHESIZER_PORT",
            default=default_bind_port,
            help=f"Port to bind to(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-host",
            env_name="SINCRO_SYNTHESIZER_PUBLIC_BIND_HOST",
            default=None,
            help="Public bind address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-port",
            env_name="SINCRO_SYNTHESIZER_PUBLIC_BIND_PORT",
            default=default_bind_port,
            help=f"Public bind port(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--voicevox-host",
            env_name="SINCRO_SYNTHESIZER_VOICEVOX_HOST",
            default=None,
            help="VOICEVOX engine address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--voicevox-port",
            env_name="SINCRO_SYNTHESIZER_VOICEVOX_PORT",
            default=50021,
            help="VOICEVOX engine port(default: 50021)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--voicevox-default-style-id",
            env_name="SINCRO_SYNTHESIZER_VOICEVOX_DEFAULT_STYLE_ID",
            default=0,
            help="VOICEVOX Style ID(default: 0)",
        )

        return
