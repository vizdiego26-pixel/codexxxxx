#!/usr/bin/env python3
"""Extract the 70 original study images and their answer key from the source PDF.

Requires Python 3 and PyMuPDF (`python -m pip install PyMuPDF`). Run from any
directory; an optional argument overrides public/source.pdf as the source.
Images are extracted directly, without rendering the page or including answers.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
PAGE_HEADINGS = {
    "Lectura del campo y de la flecha": "reading",
    "Fundamento del rótulo final": "rationale",
    "Qué es": "definition",
    "Función": "function",
    "Relación con el embrión y el desarrollo": "development",
    "Cómo distinguirlo de estructuras cercanas": "distinction",
    "Contraste con el envío": "contrast",
    "Fuentes": "sources",
}

# Organizational tags only: the questions, answers and explanations stay literal.
CATEGORIES = {
    "Cartílago": {1, 6, 31, 36, 46, 60},
    "Tejido óseo": {4, 7, 11, 14, 15, 22, 27, 48, 49, 59},
    "Tejido muscular": {2, 3, 10, 20, 24, 35, 43, 70},
    "Osificación": {9, 17, 25, 41, 42, 55, 58, 62},
    "Neurulación": {5, 8, 13, 16, 23, 26, 30, 50, 64, 65, 66, 69},
    "Mesodermo y derivados": {12, 18, 19, 21, 29, 34, 37, 39, 47, 51, 52, 56, 61, 67},
    "Desarrollo de miembros": {28, 40, 53, 63},
    "Desarrollo embrionario": {32, 33, 38, 44, 45, 54, 57, 68},
}
HISTOLOGY_CATEGORIES = {"Cartílago", "Tejido óseo", "Tejido muscular"}


def clean(value: str) -> str:
    return " ".join(value.split())


def text_blocks(page: fitz.Page) -> list[tuple]:
    return sorted(page.get_text("blocks"), key=lambda block: (block[1], block[0]))


def sections(page: fitz.Page) -> dict[str, str]:
    result: dict[str, list[str]] = {}
    current = None
    for block in text_blocks(page):
        if block[1] < 130 or block[1] > 790:
            continue
        text = clean(block[4])
        if text in PAGE_HEADINGS:
            current = PAGE_HEADINGS[text]
            result[current] = []
        elif text.startswith("Pauta del QUIZ 4 revisada"):
            current = None
        elif current:
            result[current].append(text)
    return {key: " ".join(value) for key, value in result.items()}


def extract(source: Path) -> list[dict]:
    slides = ROOT / "public" / "slides"
    output = ROOT / "public" / "data" / "cards.json"
    slides.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    cards = []
    with fitz.open(source) as document:
        assert len(document) == 156, f"Unexpected PDF length: {len(document)}"
        for number in range(1, 71):
            page_index = 2 * number - 1
            page = document[page_index]
            following_page = document[page_index + 1]
            title = next(clean(b[4]) for b in text_blocks(page) if 70 < b[1] < 100)
            assert title == f"Lámina {number:02d}", title
            qa = [clean(b[4]) for b in text_blocks(page) if 100 < b[1] < 150]
            assert len(qa) == 2, (number, qa)
            question, answer = qa
            images = page.get_images(full=True)
            assert len(images) == 1, (number, "Unexpected image count", len(images))
            original = document.extract_image(images[0][0])
            name = f"lamina-{number:02d}.{original['ext']}"
            (slides / name).write_bytes(original["image"])
            explanation = sections(page) | sections(following_page)
            assert set(explanation) == set(PAGE_HEADINGS.values()), (number, explanation.keys())
            assert all(explanation.values()), (number, "Empty explanation section")
            category = next(category for category, numbers in CATEGORIES.items() if number in numbers)
            cards.append({
                "id": f"L{number:02d}",
                "number": number,
                "question": question,
                "answer": answer,
                "image": f"/slides/{name}",
                "sourcePage": page_index + 1,
                "topic": "Histología" if category in HISTOLOGY_CATEGORIES else "Embriología",
                "category": category,
                "explanation": explanation,
            })
    assert len(cards) == len({card["id"] for card in cards}) == 70
    assert set().union(*CATEGORIES.values()) == set(range(1, 71))
    assert sum(map(len, CATEGORIES.values())) == 70
    output.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(cards)} cards → {output}")
    print("Topics:", dict(Counter(card["topic"] for card in cards)))
    print("Categories:", dict(Counter(card["category"] for card in cards)))
    return cards


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=ROOT / "public" / "source.pdf")
    arguments = parser.parse_args()
    extract(arguments.source)
