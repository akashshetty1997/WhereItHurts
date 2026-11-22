"""Every fixed value the backend uses, in one place.

Rules: no environment reads and no logic here. Values that change per machine or are secret
(API keys, which engine to run, folders) belong in app/config.py instead.
"""

# --- API -----------------------------------------------------------------------------------

API_PREFIX = "/api"
APP_TITLE = "WhereItHurts API"
# The Vite dev server. The frontend normally goes through its /api proxy; CORS covers direct calls.
ALLOWED_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")

# --- Visit domain (must match the frontend's src/regions.js and docs/PLAN.md) -----------------

# Left and right always mean the PATIENT's side.
REGION_IDS = (
    "head",
    "neck",
    "upper_back",
    "lower_back",
    "left_leg",
    "left_knee",
    "right_shoulder",
)
PAIN_TYPES = ("burning", "sharp", "aching")
SPEAKER_ROLES = ("doctor", "patient")
MAX_SENTENCE_CHARS = 1000

# --- LLM extraction (sentence -> regions, path, follow-up) ----------------------------------

# Fast model: the whole round trip has to fit the ~1.5 s budget in docs/PLAN.md.
LLM_MODEL = "claude-haiku-5-5"
LLM_TIMEOUT_S = 2.0
LLM_MAX_TOKENS = 200

EXTRACT_SOURCE_LLM = "llm"
EXTRACT_SOURCE_KEYWORDS = "keywords"

# --- Keyword fallback ------------------------------------------------------------------------

# Matching is whole-word and case-insensitive. Across all regions the longest phrase is matched
# first and its words are used up, so "upper back" is never also read as "back" (lower_back) and
# "shoulder blades" is never also read as "shoulder".
REGION_KEYWORDS: dict[str, tuple[str, ...]] = {
    "head": ("headaches", "headache", "migraine", "head"),
    "neck": ("cervical spine", "cervical", "neck"),
    "upper_back": (
        "between my shoulder blades",
        "shoulder blades",
        "shoulder blade",
        "thoracic spine",
        "middle back",
        "upper back",
        "mid back",
        "thoracic",
    ),
    "lower_back": ("lumbar spine", "lower back", "lumbar", "back"),
    "left_leg": ("left leg", "thigh", "calf", "leg"),
    "left_knee": ("left knee", "knee"),
    "right_shoulder": ("right shoulder", "shoulder"),
}
# Words that describe pain moving, which turns the mentioned regions into a pulse path.
MOVEMENT_WORDS = (
    "down",
    "into",
    "through",
    "radiates",
    "radiating",
    "spreads",
    "spreading",
    "goes",
    "shoots",
    "travels",
)
FOLLOW_UP_WORDS = ("follow-up", "follow up", "come back", "schedule")

# --- Audio input -----------------------------------------------------------------------------

SAMPLE_RATE = 16000
MAX_AUDIO_BYTES = 200 * 1024 * 1024
MAX_HINTS = 100
MAX_SPEAKERS = 6
DEFAULT_SPEAKERS = 2

# --- Speech-to-text models (files live in MODELS_DIR, see backend/README.md) -----------------

ENGINE_PARAKEET = "parakeet"
ENGINE_WHISPER = "whisper"
PARAKEET_MODEL_DIR = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8"
VAD_MODEL_FILE = "silero_vad.onnx"
EMBEDDING_MODEL_FILE = "nemo_en_titanet_small.onnx"
WHISPER_MODEL = "large-v3-turbo"
WHISPER_COMPUTE_TYPE = "int8"
WHISPER_PROMPT_PREFIX = "Doctor's appointment. Terms: "
TRANSCRIPT_LANGUAGE = "en"

# Parakeet: audio is cut at pauses (Silero VAD) into pieces of at most this many seconds, so
# memory stays flat for long visits.
MAX_PIECE_SECONDS = 20
# The VAD marks speech a little late; an unpadded cut clips the first word.
PAD_SECONDS = 0.3
# Pieces decoded at once: one batch of a whole visit would hold every piece's activations
# (tens of GB for 30 minutes).
BATCH_SIZE = 4
VAD_MIN_SILENCE_S = 0.25

# --- Diarization (who said each sentence) ----------------------------------------------------

SENTENCE_ENDS = (".", "?", "!")
# A silence this long between words is a turn boundary even without punctuation.
PAUSE_S = 0.5
# Longer than this, a "sentence" is split at commas (or evenly), so a missed full stop can't
# glue two people together for long.
MAX_SENTENCE_S = 12.0
# Embeddings of shorter audio are unreliable: they're grouped by the nearest voice instead of
# taking part in the clustering, and their window is widened to MIN_WINDOW_S.
MIN_CLUSTER_S = 1.0
MIN_WINDOW_S = 0.6
# Cosine distance under which two voices are one person, when the count isn't known.
CLUSTER_THRESHOLD = 0.7
# A turn of one voice that would grow past this many characters continues as a new turn at the
# next sentence, so a long monologue stays readable lines and nothing is ever cut.
MAX_TURN_CHARS = 1000
SPEAKER_LABEL = "Speaker {n}"
