"""WebSocket /api/live: stream the mic, get back who said what.

/api/live              the visit: enroll both voices, then every sentence gets its speaker
/api/live?mode=prep    before the visit: only the patient talks, no enrollment

Browser -> server
  binary frames   16 kHz mono 16-bit little-endian PCM, any chunk size
  {"type": "enroll", "speaker": "pt" | "patient"}   the next sentence is that person's voice
  {"type": "flush"}                                 end of speech: finish the current sentence
  {"type": "region", "region": "<id>" | null}       prep: the region the patient tapped
Server -> browser
  {"type": "ready"}                                 listening
  {"type": "enrolling" | "enrolled" | "enroll_retry", "speaker": ..., ...}
  {"type": "segment", "segment": {...visit segment...}, "extraction": {...}, "sure": bool}
  {"type": "error", "code": "transcription_off" | "unknown_speaker" | "bad_message"}
"""

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.constants import LIVE_MODE_PREP
from app.services.live import LiveSession, Segmenter, pcm16_to_float

router = APIRouter(tags=["live"])
_logger = logging.getLogger("whereithurts.live")


@router.websocket("/live")
async def live(ws: WebSocket) -> None:
    await ws.accept()
    transcription = ws.app.state.transcription
    if not transcription.available:
        await ws.send_json({"type": "error", "code": "transcription_off"})
        await ws.close()
        return

    segmenter = Segmenter(transcription.vad_model)
    prep = ws.query_params.get("mode") == LIVE_MODE_PREP
    session = LiveSession(
        transcription.words_of, transcription.voice_of, single_speaker="patient" if prep else None
    )
    # Sentences and enroll commands share one queue, so they're handled in the order they came.
    queue: asyncio.Queue = asyncio.Queue()

    async def send(event: dict | None) -> None:
        if event is not None:
            # The browser may have left already; then there's nothing to tell it.
            with contextlib.suppress(WebSocketDisconnect, RuntimeError):
                await ws.send_json(event)

    async def worker() -> None:
        while (item := await queue.get()) is not None:
            if isinstance(item, str):  # an enroll command
                await send(session.enroll(item))
            else:  # models run off the event loop, so the socket keeps receiving audio
                for event in await asyncio.to_thread(session.handle, item):
                    await send(event)

    task = asyncio.create_task(worker())
    await send({"type": "ready"})
    try:
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes"):
                for utterance in segmenter.feed(pcm16_to_float(message["bytes"])):
                    queue.put_nowait(utterance)
            elif message.get("text"):
                try:
                    command = json.loads(message["text"])
                except json.JSONDecodeError:
                    await send({"type": "error", "code": "bad_message"})
                    continue
                if command.get("type") == "region":
                    await send(session.set_region(command.get("region")))
                elif command.get("type") == "enroll":
                    queue.put_nowait(str(command.get("speaker")))
                elif command.get("type") == "flush":
                    for utterance in segmenter.flush():
                        queue.put_nowait(utterance)
    except WebSocketDisconnect:
        pass
    finally:
        queue.put_nowait(None)
        await task
        _logger.info("live_closed")
