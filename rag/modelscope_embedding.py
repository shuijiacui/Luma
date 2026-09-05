"""LlamaIndex embedding adapter for ModelScope OpenAI-compatible API."""
from typing import Any
import os
import requests
from llama_index.core.embeddings import BaseEmbedding

class ModelScopeEmbedding(BaseEmbedding):
    model_name: str = "Qwen/Qwen3-Embedding-4B"
    base_url: str = "https://api-inference.modelscope.cn/v1"
    api_key: str = ""

    def __init__(self, model_name=None, base_url=None, api_key=None, **kwargs: Any):
        super().__init__(model_name=model_name or os.getenv("RAG_EMBED_MODEL", "Qwen/Qwen3-Embedding-4B"),
                         base_url=base_url or os.getenv("LLM_BASE_URL", "https://api-inference.modelscope.cn/v1"),
                         api_key=api_key or os.getenv("LLM_API_KEY", ""), **kwargs)

    def _get_query_embedding(self, query: str):
        return self._get_text_embedding(query)

    async def _aget_query_embedding(self, query: str):
        return self._get_text_embedding(query)

    def _get_text_embedding(self, text: str):
        r = requests.post(f"{self.base_url.rstrip('/')}/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={"model": self.model_name, "input": [text], "encoding_format": "float"}, timeout=90)
        r.raise_for_status()
        return r.json()["data"][0]["embedding"]

    async def _aget_text_embedding(self, text: str):
        return self._get_text_embedding(text)

    def _get_text_embeddings(self, texts):
        embeddings = []
        batch_size = 16
        dim = None
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            r = requests.post(f"{self.base_url.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={"model": self.model_name, "input": batch, "encoding_format": "float"}, timeout=180)
            if r.status_code == 200:
                data = r.json()["data"]
                embeddings.extend([x["embedding"] for x in data])
                dim = dim or len(data[0]["embedding"])
            else:
                # 个别 chunk 触发内容审查：逐条降级，触发的用零向量占位（相似度≈0，检索时被阈值自然过滤）
                for t in batch:
                    rr = requests.post(f"{self.base_url.rstrip('/')}/embeddings",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json={"model": self.model_name, "input": [t], "encoding_format": "float"}, timeout=90)
                    if rr.status_code == 200:
                        e = rr.json()["data"][0]["embedding"]
                        embeddings.append(e)
                        dim = dim or len(e)
                    else:
                        embeddings.append([0.0] * (dim or 2560))
        return embeddings
