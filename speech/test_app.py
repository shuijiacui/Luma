import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import app as service
from engine import wav_samples
from test_engine import recording


class FakeEngine:
    name = "paraformer"
    calls = 0

    def transcribe(self, data, vocabulary, language):
        wav_samples(data)
        self.calls += 1
        return "只画一半的太阳，放在左上角"


class ApiContract(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"LUMA_ASR_TOKEN": ""})
        self.environment.start()
        service.engine = FakeEngine()
        self.client = TestClient(service.app, client=("127.0.0.1", 12345))

    def tearDown(self):
        self.client.close()
        service.engine = None
        self.environment.stop()

    def request(self, data=None, model="paraformer", headers=None):
        return self.client.post("/v1/audio/transcriptions", data={"model": model, "hotwords": '{"vocabulary":["太阳"]}'},
                                files={"file": ("voice.wav", recording() if data is None else data, "audio/wav")}, headers=headers)

    def test_multipart_contract_and_validation(self):
        self.assertEqual(self.client.get("/health").json(), {"ready": True, "model": "paraformer"})
        self.assertEqual(self.request().json(), {"text": "只画一半的太阳，放在左上角"})
        self.assertEqual(self.request(model="arbitrary/repo").status_code, 400)
        self.assertEqual(self.request(b"bad").status_code, 400)
        self.assertEqual(self.request(b"x" * (service.MAX_BYTES + 16385)).status_code, 413)
        self.assertEqual(service.engine.calls, 1)

    def test_auth_and_busy(self):
        with patch.dict(os.environ, {"LUMA_ASR_TOKEN": "synthetic-test-secret"}):
            self.assertEqual(self.request().status_code, 401)
            self.assertEqual(self.request(headers={"Authorization": "Bearer synthetic-test-secret"}).status_code, 200)
        service.busy.acquire()
        try:
            self.assertEqual(self.request().status_code, 429)
        finally:
            service.busy.release()

    def test_remote_clients_require_token(self):
        remote = TestClient(service.app, client=("192.0.2.1", 2345))
        try:
            self.assertEqual(remote.post("/v1/audio/transcriptions").status_code, 403)
        finally:
            remote.close()
