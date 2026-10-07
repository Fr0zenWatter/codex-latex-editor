"""Local Markdown document types and bounded Obsidian image lookup."""
from pathlib import Path
from urllib.parse import unquote, urlsplit

SOURCE_EXTENSIONS = ('.tex', '.md', '.markdown')
IMAGE_TYPES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
               '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif'}


def document_type(path):
    return 'markdown' if Path(path).suffix.lower() in ('.md', '.markdown') else 'latex'


def markdown_resource(path, project_root, name):
    if document_type(path) != 'markdown' or not isinstance(name, str):
        raise ValueError('Markdown image not found.')
    link = urlsplit(name)
    if link.scheme or link.netloc or '\\' in name or '\0' in name:
        raise ValueError('Use a relative Markdown image path.')
    name = unquote(link.path)
    if '\\' in name or any(char in name for char in '*?[]\0') or Path(name).is_absolute() or Path(name).suffix.lower() not in IMAGE_TYPES:
        raise ValueError('Choose a PNG, JPG, GIF, WebP or AVIF image.')
    # Obsidian attachments can live at the vault root, outside the note's folder.
    boundary = next((parent for parent in path.parents if (parent / '.obsidian').is_dir()), project_root)
    candidates = [(path.parent / name).resolve(), (boundary / name).resolve()]
    for target in candidates:
        if target.is_relative_to(boundary) and target.is_file() and target.stat().st_size <= 24 * 1024 * 1024:
            return target, IMAGE_TYPES[target.suffix.lower()]
    if '/' not in name and name not in ('', '.', '..'):
        matches = [file.resolve() for file in boundary.rglob(name)
                   if file.is_file() and not any(part.startswith('.') for part in file.relative_to(boundary).parts)
                   and file.resolve().is_relative_to(boundary)]
        if len(matches) == 1 and matches[0].stat().st_size <= 24 * 1024 * 1024:
            return matches[0], IMAGE_TYPES[matches[0].suffix.lower()]
    raise ValueError('Markdown image not found or ambiguous.')
