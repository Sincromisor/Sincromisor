import os
import logging
import logging.config
from logging import Logger
from sincro_config import SincromisorConfig, SincromisorLoggerConfig

config = SincromisorConfig.from_yaml()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(
        log_file=config.get_log_path("Launcher"), stdout=True
    )
)

import time
import shutil
import signal
import subprocess as sp
from threading import Thread
from typing import List
from setproctitle import setproctitle


class ProcessStdOutReader(Thread):
    def __init__(self, name: str, process: sp.Popen, logger: Logger):
        super().__init__()
        self.name: str = name
        self.process: sp.Popen = process
        self.logger: Logger = logger

    def run(self):
        line: bytes
        while line := self.process.stdout.readline():
            line_s: str = line.decode().rstrip("\r\n")
            self.logger.info(line_s)


class ProcessStdErrReader(Thread):
    def __init__(self, name: str, process: sp.Popen, logger: Logger):
        super().__init__()
        self.name: str = name
        self.process: sp.Popen = process
        self.logger: Logger = logger

    def run(self):
        line: bytes
        while line := self.process.stderr.readline():
            line_s: str = line.decode().rstrip("\r\n")
            self.logger.warning(line_s)


class ProcessLauncher:
    def __init__(self, name: str, worker_id: int, args: list):
        self.args: list = args
        self.name: str = name
        self.process: sp.Popen | None = None
        self.stdout_t: Thread | None = None
        self.stderr_t: Thread | None = None
        self.worker_id: int = worker_id
        self.logger: Logger = logging.getLogger(name)
        # サブプロセスに環境変数を引き継ぐ。
        # 環境変数SINCROMISOR_CONFで明示的に設定ファイルの絶対パスを渡す。
        self.newenv = os.environ.copy()
        self.newenv["SINCROMISOR_CONF"] = config.config_path()
        self.newenv["SINCROMISOR_WORKER_ID"] = str(self.worker_id)

    def start(self):
        self.process = sp.Popen(
            self.args, stdout=sp.PIPE, stderr=sp.PIPE, env=self.newenv
        )
        self.stdout_t = ProcessStdOutReader(
            name=self.name, process=self.process, logger=self.logger
        )
        self.stdout_t.start()
        self.stderr_t = ProcessStdErrReader(
            name=self.name, process=self.process, logger=self.logger
        )
        self.stderr_t.start()

    def active(self):
        return self.process.poll() is None

    def stop(self):
        self.logger.info(f"Stopping {self.name}")
        self.process.send_signal(signal.SIGINT)
        self.stdout_t.join()
        self.stderr_t.join()
        self.logger.info(f"{self.name} was terminated.")


setproctitle("SincroLauncher")
running: bool = True
processes: List[ProcessLauncher] = []


def all_active():
    global processes
    for process in processes:
        if not process.active():
            return False
    return True


def stop_all_workers():
    global processes
    for process in processes:
        process.stop()


def trap_sigint(signum, frame):
    global running
    running = False


signal.signal(signal.SIGINT, trap_sigint)

for dir_name, worker_type in [
    ["speech-extractor", "SpeechExtractor"],
    ["speech-recognizer", "SpeechRecognizer"],
    ["voice-synthesizer", "VoiceSynthesizer"],
]:
    for worker_id, worker_conf in config.get_launchable_workers_conf(type=worker_type):
        worker_p: ProcessLauncher = ProcessLauncher(
            name=f"{worker_type}({worker_id})",
            worker_id=worker_id,
            args=[
                shutil.which("uvicorn"),
                f"{dir_name}.{worker_type}Process:app",
                f"--host={worker_conf.Host}",
                f"--port={worker_conf.Port}",
            ],
        )
        worker_p.start()
        processes.append(worker_p)

# --proxy-headersを設定していても、X-Forwarded-Portが常に0になる問題がある模様
# https://github.com/encode/uvicorn/discussions/1948
worker_type = "Sincromisor"
for worker_id, worker_conf in config.get_launchable_workers_conf(type=worker_type):
    web_p: ProcessLauncher = ProcessLauncher(
        name=worker_type,
        worker_id=worker_id,
        args=[
            shutil.which("uvicorn"),
            "sincro-rtc.Sincromisor:app",
            f"--host={worker_conf.Host}",
            f"--port={worker_conf.Port}",
            "--proxy-headers",
            f'--forwarded-allow-ips="{worker_conf.ForwardedAllowIps}"',
            # "--log-level=debug"
        ],
    )
    web_p.start()
    processes.append(web_p)

while running and all_active():
    time.sleep(0.5)

stop_all_workers()
