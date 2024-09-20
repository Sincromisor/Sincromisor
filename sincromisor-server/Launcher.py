import logging
from logging import Logger

logging.basicConfig(
    filename="log/Launcher.log",
    encoding="utf-8",
    level=logging.INFO,
    format=f"[%(asctime)s] {logging.BASIC_FORMAT}",
    datefmt="%Y/%m/%d %H:%M:%S",
)

import time
import shutil
import signal
import subprocess as sp
from threading import Thread
from sincroLib.utils import ConfigManager
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
    def __init__(self, name: str, args: list):
        self.args: list = args
        self.name: str = name
        self.process: sp.Popen | None = None
        self.stdout_t: Thread | None = None
        self.stderr_t: Thread | None = None
        self.logger: Logger = logging.getLogger(name)

    def start(self):
        self.process = sp.Popen(self.args, stdout=sp.PIPE, stderr=sp.PIPE)
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
ConfigManager.load()
config = ConfigManager()
running = True
processes = []


def all_active():
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

for worker_type in ["SpeechExtractor", "SpeechRecognizer", "VoiceSynthesizer"]:
    for worker_id, worker_conf in config.get_launchable_workers_conf(type=worker_type):
        worker_p = ProcessLauncher(
            name=f"{worker_type}({worker_id})",
            args=[
                shutil.which("uvicorn"),
                f"{worker_type}Process:app",
                f"--host={worker_conf['host']}",
                f"--port={worker_conf['port']}",
            ],
        )
        worker_p.start()
        processes.append(worker_p)

# --proxy-headersを設定していても、X-Forwarded-Portが常に0になる問題がある模様
# https://github.com/encode/uvicorn/discussions/1948
for worker_id, worker_conf in config.get_launchable_workers_conf(type="Sincromisor"):
    web_p = ProcessLauncher(
        name="Sincromisor",
        args=[
            shutil.which("uvicorn"),
            "Sincromisor:app",
            f"--host={worker_conf['host']}",
            f"--port={worker_conf['port']}",
            "--proxy-headers",
            f"--forwarded-allow-ips=\"{worker_conf['forwarded-allow-ips']}\"",
            # "--log-level=debug"
        ],
    )
    web_p.start()
    processes.append(web_p)

while running and all_active():
    time.sleep(0.5)

stop_all_workers()
