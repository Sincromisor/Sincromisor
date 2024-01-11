import json
import logging
from collections.abc import Generator
from logging import Logger

import requests
from requests import Response


class DifyClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)

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
        query_data = {
            "inputs": inputs,
            "query": query,
            "user": "username",
            "response_mode": "streaming",
            "files": None,
        }
        if conversation_id:
            query_data["conversation_id"] = conversation_id

        res: Response = self.__send_request(
            "POST", "/chat-messages", query_data, stream=True
        )

        line: str
        for line in res.iter_lines(decode_unicode=True):
            response_data: str = line.split("data:", 1)[-1]
            if response_data:
                try:
                    if response_data == "event: ping":
                        response_data = '{"event": "ping"}'
                    yield json.loads(response_data)
                except json.decoder.JSONDecodeError as e:
                    self.logger.warning("JSONDecodeError: " + response_data)
                    raise e

    def __send_request(
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
