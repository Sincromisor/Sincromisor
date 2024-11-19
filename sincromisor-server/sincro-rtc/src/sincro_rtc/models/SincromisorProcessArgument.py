from argparse import ArgumentParser

from sincro_config import SincromisorArgumentParser


class SincromisorProcessArgument(SincromisorArgumentParser):
    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    redis_host: str
    redis_port: int
    forwarded_allow_ips: str
    max_sessions: int
    log_file: str | None

    @classmethod
    def set_args(cls, parser: ArgumentParser) -> None:
        super().set_args(parser=parser)

        default_bind_port: int = 8001

        cls.add_argument(
            parser=parser,
            cmd_name="--host",
            env_name="SINCRO_RTC_HOST",
            default="127.0.0.1",
            help="Host to bind to(default: 127.0.0.1)",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--port",
            env_name="SINCRO_RTC_PORT",
            default=default_bind_port,
            help=f"Port to bind to(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-host",
            env_name="SINCRO_RTC_PUBLIC_BIND_HOST",
            default=None,
            help="Public bind address",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--public-bind-port",
            env_name="SINCRO_RTC_PUBLIC_BIND_PORT",
            default=default_bind_port,
            help=f"Public bind port(default: {default_bind_port})",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--forwarded-allow-ips",
            env_name="SINCRO_RTC_FORWARDED_ALLOW_IPS",
            default="127.0.0.0/8",
            help="Reverse proxy IPs",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--max-sessions",
            env_name="SINCRO_RTC_MAX_SESSIONS",
            default=10,
            help="Max WebRTC sessions(default: 10)",
        )

        return
