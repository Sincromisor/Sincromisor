from argparse import ArgumentParser

from sincro_config import SincromisorArgumentParser


class TextProcessorProcessArgument(SincromisorArgumentParser):
    """TextProcessorの待受と、チャット時だけ使うMastra接続設定を保持する。"""

    host: str
    port: int
    public_bind_host: str
    public_bind_port: int
    mastra_url: str
    mastra_token: str | None
    mastra_agent_id: str

    @classmethod
    def set_args(cls, parser: ArgumentParser) -> None:
        super().set_args(parser=parser)

        default_bind_port: int = 8004

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
            cmd_name="--mastra-url",
            env_name="SINCRO_PROCESSOR_MASTRA_URL",
            default="http://agent-server:4111",
            help="MastraのURL（既定: http://agent-server:4111）",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--mastra-token",
            env_name="SINCRO_PROCESSOR_MASTRA_TOKEN",
            default=None,
            help="Mastraのアクセストークン（既定: なし）",
        )

        cls.add_argument(
            parser=parser,
            cmd_name="--mastra-agent-id",
            env_name="SINCRO_PROCESSOR_MASTRA_AGENT_ID",
            default="sincromisor-character",
            help="MastraのエージェントID（既定: sincromisor-character）",
        )
