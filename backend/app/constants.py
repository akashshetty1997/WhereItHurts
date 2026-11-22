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
SPEAKER_ROLES = ("pt", "patient")  # pt = the physical therapist
# Side words. A region id starting with one side ("left_knee") is not counted when the word
# right before the body part names the other side ("my right knee"): we have no region for it.
SIDES = ("left", "right")
MAX_SENTENCE_CHARS = 1000

# --- LLM extraction (sentence -> regions, path, rating, movement, pain type) ---------------

# Which Claude runs the extraction (settings.llm_provider):
LLM_PROVIDER_CLAUDE_CODE = "claude_code"  # `claude -p` with the Claude Code login, no API key
LLM_PROVIDER_API = "api"  # Anthropic SDK with ANTHROPIC_API_KEY
LLM_PROVIDER_OFF = "off"  # keywords only
LLM_PROVIDERS = (LLM_PROVIDER_CLAUDE_CODE, LLM_PROVIDER_API, LLM_PROVIDER_OFF)

# Fast, cheap model: extraction is high-volume and latency-sensitive.
LLM_MODEL = "claude-haiku-5-5"  # API model id
CLAUDE_CODE_MODEL = "haiku"  # the same model, as Claude Code names it
LLM_EFFORT = "low"
LLM_MAX_TOKENS = 2048  # room for thinking plus the small JSON answer
# The smart pass runs after the instant keyword answer, so it can take a few seconds.
LLM_TIMEOUT_S = 15.0
CLAUDE_CLI = "claude"

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
# Body words inside a movement instruction aren't a mention of that body part:
# "turn your head to the left" tests the neck, it doesn't talk about the head.
NOT_A_MENTION = (
    "turn your head",
    "turning your head",
    "tilt your head",
    "nod your head",
    "look over your shoulder",
    "shrug your shoulders",
)
# Words that name the feeling -> one of PAIN_TYPES (first match in the sentence wins).
PAIN_TYPE_WORDS: dict[str, tuple[str, ...]] = {
    "burning": ("burning", "burns", "burn", "hot", "on fire"),
    "sharp": ("sharp", "stabbing", "shooting", "stabs", "pins and needles"),
    "aching": ("aching", "aches", "ache", "achy", "dull", "throbbing", "sore"),
}
# Spoken pain ratings: "five out of ten", "about a five", "maybe a 2".
RATING_MIN = 0
RATING_MAX = 10
NUMBER_WORDS = (
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
)
RATING_LEAD_WORDS = ("about", "maybe", "around", "like", "probably", "roughly", "a solid")

# --- PT vocabulary ---------------------------------------------------------------------------

# Muscles, joints and movements with their region and common mishearings, in app/data/.
# Edit the CSV to add words; services/vocabulary.py loads it once.
PT_TERMS_FILE = "pt_terms.csv"
PT_TERMS_ALIAS_SEPARATOR = "|"

# --- Accounts (demo login/register) --------------------------------------------------------

USER_ROLES = ("patient", "pt")  # pt = the physical therapist
# Picks which 3D patient (avatar) the app shows. Accounts made before this field are "male".
GENDERS = ("female", "male")
DEFAULT_GENDER = "male"
NAME_MAX_CHARS = 80
EMAIL_MAX_CHARS = 254
PASSWORD_MIN_CHARS = 8
PASSWORD_MAX_CHARS = 128
# scrypt password hashing (Python's hashlib, no extra dependency).
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_KEY_BYTES = 32
SALT_BYTES = 16
SESSION_TOKEN_BYTES = 32
AUTH_SCHEME = "Bearer"

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
