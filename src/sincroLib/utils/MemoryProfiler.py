import gc
import sys
from typing import Any


class MemoryProfiler:
    def __init__(self):
        self.checkpoint = self.check()

    def check(self) -> dict[str, Any]:
        objs: dict[str, Any] = {}
        for obj in gc.get_objects():
            name = type(obj).__name__
            if name in objs:
                objs[name] += 1
            else:
                objs[name] = 1
        return objs

    def diff(self) -> dict[str, Any]:
        new_objs: dict[str, Any] = {}
        for k, v in self.check().items():
            if k in self.checkpoint:
                count = self.checkpoint[k] - v
                if count > 0:
                    new_objs[k] = count
            else:
                new_objs[k] = v
        return new_objs

    def update(self) -> dict[str, Any]:
        self.checkpoint = self.check()
        return self.checkpoint

    def top(self) -> list[Any]:
        objs: dict[str, Any] = {}
        for obj in gc.get_objects():
            name = type(obj).__name__
            size = sys.getsizeof(obj)
            if name in objs:
                objs[name] += size
            else:
                objs[name] = size
        return sorted(objs.items(), key=lambda x: x[1])


if __name__ == "__main__":
    mp = MemoryProfiler()
    for k, v in mp.check().items():
        print(f"{k}: {v}")
