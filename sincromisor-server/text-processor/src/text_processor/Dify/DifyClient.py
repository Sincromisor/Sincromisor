import json
from collections.abc import Generator

import requests
from requests import Response


class DifyClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key

    def __headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def chat(
        self,
        inputs: dict,
        query: str,
        conversation_id: str | None,
    ) -> Generator[dict, None, None]:
        data = {
            "inputs": inputs,
            "query": query,
            "user": "username",
            "response_mode": "streaming",
            "files": None,
        }
        if conversation_id:
            data["conversation_id"] = conversation_id

        res: Response = self._send_request("POST", "/chat-messages", data, stream=True)

        line: str
        for line in res.iter_lines(decode_unicode=True):
            data: str = line.split("data:", 1)[-1]
            if data:
                yield json.loads(data)

    def _send_request(
        self,
        method,
        endpoint,
        json=None,
        params=None,
        stream=True,
    ) -> Response:
        url = f"{self.base_url}{endpoint}"
        response: Response = requests.request(
            method,
            url,
            json=json,
            params=params,
            headers=self.__headers(),
            stream=stream,
        )
        response.raise_for_status()
        return response
