import logging
import logging.config
import os
import signal
import subprocess as sp
import time
from argparse import ArgumentParser, Namespace
from logging import Logger
from pathlib import Path
from threading import Thread
from typing import IO

from dotenv import dotenv_values
from setproctitle import setproctitle
from sincro_config import SincromisorLoggerConfig

setproctitle("SincroLauncher")


class ProcessStdOutReader(Thread):
    def __init__(self, name: str, process: sp.Popen, logger: Logger):
        super().__init__()
        self.name: str = name
        self.process: sp.Popen = process
        self.logger: Logger = logger

    def run(self) -> None:
        line: bytes | None
        if not isinstance(self.process.stdout, IO):
            return
        while line := self.process.stdout.readline():
            line_s: str = line.decode().rstrip("\r\n")
            self.logger.info(line_s)


class ProcessStdErrReader(Thread):
    def __init__(self, name: str, process: sp.Popen, logger: Logger):
        super().__init__()
        self.name: str = name
        self.process: sp.Popen = process
        self.logger: Logger = logger

    def run(self) -> None:
        line: bytes | None
        if not isinstance(self.process.stderr, IO):
            return
        while line := self.process.stderr.readline():
            line_s: str = line.decode().rstrip("\r\n")
            self.logger.warning(line_s)


class ProcessLauncher:
    def __init__(self, name: str, args: list, envs: dict[str, str]):
        self.args: list = args
        self.name: str = name
        self.process: sp.Popen
        self.stdout_t: Thread
        self.stderr_t: Thread
        self.logger: Logger = logging.getLogger(name)
        # サブプロセスに環境変数を引き継ぐ。
        self.newenv = os.environ.copy()
        self.newenv |= envs
        self.__start()

    def __start(self) -> None:
        self.process = sp.Popen(
            self.args,
            stdout=sp.PIPE,
            stderr=sp.PIPE,
            env=self.newenv,
        )
        self.stdout_t = ProcessStdOutReader(
            name=self.name,
            process=self.process,
            logger=self.logger,
        )
        self.stdout_t.start()
        self.stderr_t = ProcessStdErrReader(
            name=self.name,
            process=self.process,
            logger=self.logger,
        )
        self.stderr_t.start()

    # サブプロセスが稼働していたらTrue、終了していたらFalseを返す
    def active(self) -> bool:
        return self.process.poll() is None

    def stop(self) -> None:
        self.logger.info(f"Stopping {self.name}")
        if not self.active():
            self.logger.info(f"Already stopeed - {self.name}")
        else:
            self.process.send_signal(signal.SIGINT)
        self.stdout_t.join()
        self.stderr_t.join()
        self.logger.info(f"{self.name} was terminated.")


class SincroLauncher:
    def __init__(self):
        self.__args = self.__parse_args()
        self.__logger: Logger = self.__setup_logger(log_file=self.__args.log_file)
        self.__logger.info("===== Starting SincroLauncher =====")
        self.__envs = self.__get_envs(self.__args.env_file)
        self.__logger.info(self.__envs)
        self.workers: list[ProcessLauncher] = []

    def __parse_args(self) -> Namespace:
        parser: ArgumentParser = ArgumentParser()
        parser.add_argument("--env-file", type=str, help=".env file", required=True)
        parser.add_argument(
            "--log-file",
            type=str,
            default=None,
            help="log file path(default: None(to stdout))",
        )
        return parser.parse_args()

    def __setup_logger(self, log_file: str | None) -> Logger:
        logging.config.dictConfig(
            SincromisorLoggerConfig.generate(log_file=log_file, stdout=True),
        )
        return logging.getLogger("sincro." + __name__)

    def __get_envs(self, env_file: str) -> dict[str, str | None]:
        return dotenv_values(env_file)

    def launch(self):
        cmds: list[str] = [
            "sincro-rtc/RTCSignalingServer.py",
            "speech-extractor/SpeechExtractorProcess.py",
            "speech-recognizer/SpeechRecognizerProcess.py",
            "text-processor/TextProcessorProcess.py",
            "voice-synthesizer/VoiceSynthesizerProcess.py",
        ]
        for cmd in cmds:
            worker_p: ProcessLauncher = ProcessLauncher(
                name=Path(cmd).stem, args=["uv", "run", cmd], envs=self.__envs
            )
            self.workers.append(worker_p)

        signal.signal(signal.SIGINT, self.__signal_trap)

    # 全てのワーカープロセスが稼働中であればTrue、ひとつでも終了していればFalseを返す。
    def all_active(self) -> bool:
        for worker in self.workers:
            if not worker.active():
                return False
        return True

    def stop(self) -> None:
        for worker in self.workers:
            worker.stop()

    def __signal_trap(self, signum: int, handler: int) -> None:
        print(["signal", signum, handler])
        self.stop()


if __name__ == "__main__":
    sl: SincroLauncher = SincroLauncher()
    # ソースファイルのあるディレクトリに移動する。
    # コンストラクタが呼ばれる前だと、
    # --env_fileオプションが相対パスで設定されていない場合に、
    # 想定していないパスから読まれる不具合が発生する
    os.chdir(os.path.dirname(__file__))
    sl.launch()
    while sl.all_active():
        time.sleep(1)
    sl.stop()
