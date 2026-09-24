import io
import logging
import unittest
import wave
from engine import Engine, wav_samples, hotwords
from evaluate import distance, normalize


def recording(seconds=1, rate=16000):
    stream = io.BytesIO()
    with wave.open(stream, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"\0\0" * int(seconds * rate))
    return stream.getvalue()


class AudioContract(unittest.TestCase):
    def test_exact_wav_format_and_duration(self):
        self.assertEqual(len(wav_samples(recording())), 32000)
        self.assertEqual(len(wav_samples(recording(20.5))), 656000)
        for data in [b"invalid", recording(22), recording(.05), recording(rate=8000), recording()[:-5]]:
            with self.assertRaises(ValueError):
                wav_samples(data)

    def test_bounded_hotwords(self):
        self.assertEqual(hotwords('{"vocabulary":["太阳","太阳","蔡阳"]}'), ["太阳", "蔡阳"])
        self.assertEqual(hotwords("bad json"), [])
        self.assertEqual(len(hotwords({"vocabulary": [str(i) for i in range(100)]})), 80)

    def test_metrics_detect_missing_negation(self):
        self.assertGreater(distance(normalize("不要红色"), normalize("要红色")), 0)
        self.assertEqual(distance("太阳", "蔡阳"), 1)

    def test_inference_does_not_log_words_or_use_hotwords_as_urls(self):
        class Model:
            def generate(self, **options):
                logging.info("Hotword list: %s", options.get("hotword"))
                return [{"text": "<|zh|><|HAPPY|>太阳"}]
        engine = Engine(model=Model())
        with self.assertNoLogs(level="INFO"):
            self.assertEqual(engine.transcribe(recording(), {"vocabulary": ["蔡阳"]}), "太阳")
        self.assertEqual(hotwords({"vocabulary": ["http://localhost/private.txt"]}), ["httplocalhostprivatetxt"])


if __name__ == "__main__":
    unittest.main()
