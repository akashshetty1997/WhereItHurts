class LlmUnavailableError(RuntimeError):
    """The smart pass can't answer (off, not installed, timed out, refused, bad output).
    Callers keep the keyword answer."""
