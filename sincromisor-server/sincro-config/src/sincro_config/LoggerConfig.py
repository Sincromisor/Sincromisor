class LoggerConfig:
    DefaultConfig: dict = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "[%(asctime)s] %(name)-20s %(levelname)s: %(message)s"
            },
            "access": {
                "format": "[%(asctime)s] %(name)-20s %(levelname)s: %(message)s"
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            },
            "log_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "INFO",
                "formatter": "default",
                "filename": "sincromisor-default.log",
                "maxBytes": 10485760,
                "backupCount": 100,
                "encoding": "utf8",
            },
        },
        "loggers": {
            "uvicorn.error": {
                "level": "INFO",
                "handlers": [],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": [],
                "propagate": False,
            },
        },
        "root": {
            "level": "INFO",
            "handlers": [],
            "propagate": False,
        },
    }

    @classmethod
    def generate(cls, log_file: str | None = None, stdout: bool = True) -> dict:
        newconfig: dict = cls.DefaultConfig.copy()
        if stdout:
            newconfig["root"]["handlers"].append("default")
            newconfig["loggers"]["uvicorn.error"]["handlers"].append("default")
            newconfig["loggers"]["uvicorn.access"]["handlers"].append("default")
        if log_file:
            newconfig["handlers"]["log_file"]["filename"] = log_file
            newconfig["root"]["handlers"].append("log_file")
            newconfig["loggers"]["uvicorn.error"]["handlers"].append("log_file")
            newconfig["loggers"]["uvicorn.access"]["handlers"].append("log_file")
        return newconfig


if __name__ == "__main__":
    from pprint import pprint

    pprint(LoggerConfig.generate(log_file="Sincromisor.1.log"))
