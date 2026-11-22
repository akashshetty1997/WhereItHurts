"""Any browser recording (webm/opus, mp4/aac, wav) to 16 kHz mono float32, in memory."""

import subprocess
import tempfile

import numpy as np

from app.constants import SAMPLE_RATE


class UnreadableAudioError(ValueError):
    pass


def _ffmpeg(source: str, data: bytes | None) -> bytes | None:
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", source]
        + ["-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1"],
        input=data,
        capture_output=True,
        check=False,
    )
    return proc.stdout if proc.returncode == 0 and proc.stdout else None


def decode(data: bytes, tmp_dir: str | None = None) -> np.ndarray:
    """Decoded through pipes, so nothing touches the disk. An MP4 whose index sits at the end
    (not Safari's fragmented MP4) can't be read from a pipe; it goes through a private temp file
    in tmp_dir, deleted as soon as it's decoded."""
    pcm = _ffmpeg("pipe:0", data)
    if pcm is None:
        with tempfile.NamedTemporaryFile(dir=tmp_dir, suffix=".audio") as tmp:
            tmp.write(data)
            tmp.flush()
            pcm = _ffmpeg(tmp.name, None)
    if pcm is None:
        raise UnreadableAudioError("Unreadable audio")
    return np.frombuffer(pcm, dtype=np.float32)
