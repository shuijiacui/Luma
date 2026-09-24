"""Bounded, local ASR adapter. Audio stays in memory and is never retained."""
import io
import json
import logging
import re
import threading
import wave

MODELS = {"paraformer": "paraformer-zh", "sensevoice": "iic/SenseVoiceSmall"}
MAX_BYTES = 3 * 1024 * 1024


def wav_samples(data):
    if not data or len(data) > MAX_BYTES:
        raise ValueError("invalid_audio")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                raise ValueError("requires_16khz_mono_pcm16_wav")
            count = audio.getnframes()
            # The UI stops at 20 s; allow encoder tail / timer scheduling jitter.
            if not 1600 <= count <= 336000:
                raise ValueError("requires_0.1_to_21_seconds")
            pcm = audio.readframes(count)
            if len(pcm) != count * 2:
                raise ValueError("truncated_audio")
            return pcm
    except (wave.Error, EOFError) as error:
        raise ValueError("invalid_wav") from error


def hotwords(raw):
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return []
    if not isinstance(value, dict) or not isinstance(value.get("vocabulary"), list):
        return []
    # FunASR also accepts file paths/URLs in the hotword argument. Only words
    # may reach it, never paths, URLs or special characters from scene context.
    return list(dict.fromkeys(re.sub(r"[^\w'-]", "", w)[:40]
                             for w in value["vocabulary"][:80] if isinstance(w, str) and w.strip()))


class PrivateInferenceLogs(logging.Filter):
    def __init__(self):
        super().__init__()
        self.thread = threading.get_ident()

    def filter(self, record):
        return record.thread != self.thread


class Engine:
    def __init__(self, name="paraformer", device="cpu", model=None):
        if name not in MODELS:
            raise ValueError("unsupported_model")
        self.name = name
        if model is None:
            from funasr import AutoModel
            model = AutoModel(model=MODELS[name], device=device, disable_update=True,
                              trust_remote_code=False, disable_log=True, disable_pbar=True, log_level="ERROR")
        self.model = model

    def transcribe(self, data, vocabulary=None, language="zh"):
        import numpy as np
        samples = np.frombuffer(wav_samples(data), dtype="<i2").astype(np.float32) / 32768
        options = dict(input=samples, fs=16000, cache={}, disable_pbar=True)
        if self.name == "paraformer":
            options["hotword"] = " ".join(["Nilo", *hotwords(vocabulary)])
        else:
            options.update(language="en" if language == "en" else "zh", use_itn=False)
        # Upstream logs hotword contents at INFO even with disable_log=True.
        # Suppress root logs from this inference thread only, not other requests.
        logger, privacy = logging.getLogger(), PrivateInferenceLogs()
        logger.addFilter(privacy)
        try:
            result = self.model.generate(**options)
        finally:
            logger.removeFilter(privacy)
        text = " ".join(str(item.get("text", "")) for item in result if isinstance(item, dict))
        # SenseVoice emotion/event tags are not claims about a child.
        return re.sub(r"<\|.*?\|>", "", text).strip()[:600]
