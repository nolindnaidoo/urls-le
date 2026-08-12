# Docs: https://docs.example.com/api/v2
API_BASE = "https://api.example.com/v2"
MIRROR = 'http://mirror.example.com:8080/pypi'
CONTACT = "mailto:ops@example.com"

ARCHIVE = "ftp://ftp.example.com/pub/dist.tar.gz"


def fetch(path: str) -> str:
    """Reads from https://api.example.com/v2 and nowhere else."""
    return f"{API_BASE}/{path}"


# A comment is still text, so its URL is still a URL:
# see http://legacy.example.com/notes for why
LOCAL = "file:///srv/data/cache.json"
