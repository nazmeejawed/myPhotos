"""Path resolution that works both from source and from a PyInstaller bundle."""

import os
import sys


def is_frozen():
    return getattr(sys, "frozen", False)


def resource_dir():
    """Directory with bundled read-only resources (static/, models/)."""
    if is_frozen():
        return sys._MEIPASS  # noqa: SLF001 - PyInstaller runtime attribute
    return os.path.dirname(os.path.abspath(__file__))


def data_dir():
    """Writable directory for the SQLite database."""
    if is_frozen():
        path = os.path.join(os.path.expanduser("~"), ".myphoto")
        os.makedirs(path, exist_ok=True)
        return path
    return os.path.dirname(os.path.abspath(__file__))


def default_photos_dir():
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "photos")
    if not is_frozen() and os.path.isdir(local):
        return local
    pictures = os.path.join(os.path.expanduser("~"), "Pictures")
    return pictures if os.path.isdir(pictures) else os.path.expanduser("~")
