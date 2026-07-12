class RTCSessionError(RuntimeError):
    """親プロセスで処理できない RTC session lifecycle 障害を表す。"""


class RTCSessionCapacityError(RTCSessionError):
    """新規 session を原子的な上限判定で拒否したことを表す。"""


class RTCSessionResponseTimeoutError(RTCSessionError):
    """子プロセスから signaling 応答が期限内に届かなかったことを表す。"""
