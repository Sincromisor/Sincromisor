import ast
from pathlib import Path


def test_offer_endpoint_is_synchronous_for_fastapi_thread_pool() -> None:
    server_path = Path(__file__).parents[1] / "RTCSignalingServer.py"
    module = ast.parse(server_path.read_text(encoding="utf-8"))
    functions = {
        node.name: node
        for node in ast.walk(module)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    assert isinstance(functions["app_offer"], ast.FunctionDef)
