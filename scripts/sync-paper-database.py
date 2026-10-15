"""Incrementally update the built-in conference-paper catalog.

Sources: public accepted notes from OpenReview API v2 and official ACL Anthology XML.
Only current-year records are polled; older synced records are retained. No PDFs are downloaded.
"""
from __future__ import annotations

import hashlib
from html import unescape
from html.parser import HTMLParser
import json
import re
import time
from email.utils import parsedate_to_datetime
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "content/paper-live-catalog.json"
INDEX_PATH = ROOT / "content/paper-live-index.json"
PROVENANCE_PATH = ROOT / "content/paper-live-provenance.json"
YEAR = datetime.now(timezone.utc).year
OPENREVIEW = "https://api2.openreview.net"
HEADERS = {"User-Agent": "RhineLabUI-Papers catalog sync (+https://github.com/HailFujah/RhineLabUI-Papers)"}
NAMESPACE = uuid.NAMESPACE_URL


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if "json" not in response.headers.get("Content-Type", "").lower():
                    raise ValueError(f"Expected JSON from {url}")
                body = response.read(20 * 1024 * 1024 + 1)
                if len(body) > 20 * 1024 * 1024:
                    raise ValueError(f"Metadata response too large from {url}")
                return json.loads(body)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 5:
                raise
            retry_after = error.headers.get("Retry-After", "")
            try:
                delay = min(600, max(1, int(retry_after)))
            except ValueError:
                try:
                    delay = min(600, max(1, int((parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds())))
                except (TypeError, ValueError, OverflowError):
                    delay = min(600, 30 * (2 ** attempt))
            print(f"Official metadata source returned HTTP {error.code}; retrying after {delay}s", flush=True)
            time.sleep(delay)


def get_bytes(url: str, maximum: int = 20 * 1024 * 1024) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(maximum + 1)
        if len(body) > maximum or "pdf" in response.headers.get("Content-Type", "").lower():
            raise ValueError(f"Unexpected or oversized metadata response from {url}")
        return body


def value(content: dict, key: str, default=None):
    item = content.get(key, default)
    if isinstance(item, dict) and "value" in item:
        return item["value"]
    return item


def clean(value_) -> str:
    return re.sub(r"\s+", " ", str(value_ or "")).strip()


def stable_id(provider: str, source_id: str) -> str:
    canonical = f"{provider.lower()}:{source_id}"
    return "paper:" + str(uuid.uuid5(NAMESPACE, "https://github.com/HailFujah/RhineLabUI-Papers/papers/" + canonical))


def slug_for(provider: str, source_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", f"{provider}-{source_id}".lower()).strip("-")


def dated(epoch):
    try:
        return datetime.fromtimestamp(int(epoch) / 1000, timezone.utc).date().isoformat()
    except (TypeError, ValueError, OverflowError):
        return str(YEAR)


def openreview_papers(stats: dict):
    # OpenReview documents that accepted papers use the venue's own venueid.
    for short, prefix in [("NeurIPS", "NeurIPS.cc"), ("ICML", "ICML.cc"), ("ICLR", "ICLR.cc")]:
        venue_id = f"{prefix}/{YEAR}/Conference"
        offset = 0
        fetched = 0
        while True:
            params = urllib.parse.urlencode({"content": "venueid", "term": venue_id,
                                             "type": "exact", "limit": 500, "offset": offset})
            result = get_json(f"{OPENREVIEW}/notes/search?{params}")
            notes = result.get("notes", [])
            for note in notes:
                content = note.get("content", {})
                if clean(value(content, "venueid")) != venue_id:
                    continue
                title = clean(value(content, "title"))
                abstract = clean(value(content, "abstract"))
                authors = value(content, "authors", [])
                if isinstance(authors, str):
                    authors = [authors]
                authors = [clean(author) for author in authors if clean(author)]
                if not title or not abstract or not authors:
                    continue
                note_id = clean(note.get("id"))
                if not note_id:
                    continue
                slug = slug_for("openreview", note_id)
                pdf_value = value(content, "pdf")
                if isinstance(pdf_value, str) and pdf_value.startswith("https://"):
                    pdf = pdf_value
                else:
                    pdf = "https://openreview.net/pdf?id=" + urllib.parse.quote(note_id, safe="")
                fetched += 1
                yield {
                    "id": stable_id("openreview", note_id), "metadata": slug, "slug": slug,
                    "revision": str(note.get("mdate") or note.get("cdate") or YEAR),
                    "pdf": pdf, "collection": "conference",
                    "paper": {"title": title, "translatedTitle": "", "authors": authors,
                              "institutions": [], "published": str(YEAR), "venue": f"{short} {YEAR}",
                              "fields": [], "keywords": [clean(k) for k in value(content, "keywords", []) if clean(k)]
                                  if isinstance(value(content, "keywords", []), list) else [],
                              "doi": clean(value(content, "doi")), "abstract": abstract,
                              "abstractLabel": "原文摘要", "url": f"https://openreview.net/forum?id={urllib.parse.quote(note_id, safe='')}",
                              "dateKind": "published", "source": {"provider": "OpenReview", "id": note_id,
                              "url": f"https://openreview.net/forum?id={urllib.parse.quote(note_id, safe='')}"}},
                }
            if not notes:
                break
            offset += len(notes)
            time.sleep(0.25)
            if len(notes) < 500:
                break
        stats[f"{short} {YEAR}"] = fetched


def acl_papers(stats: dict):
    # The official ACL Anthology repository is the canonical metadata source for ACL and EMNLP.
    for venue in ("acl", "emnlp"):
        source_url = f"https://raw.githubusercontent.com/acl-org/acl-anthology/master/data/xml/{YEAR}.{venue}.xml"
        try:
            body = get_bytes(source_url)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                stats[f"{venue.upper()} {YEAR}"] = "not published yet"
                continue
            raise
        root = ET.fromstring(body)
        count = 0
        for volume in root.findall("volume"):
            volume_name = clean(volume.findtext("title")) or volume.attrib.get("id", venue)
            for item in volume.findall("paper"):
                title = clean("".join(item.find("title").itertext())) if item.find("title") is not None else ""
                abstract = clean("".join(item.find("abstract").itertext())) if item.find("abstract") is not None else ""
                authors = [clean(" ".join(filter(None, [a.findtext("first", ""), a.findtext("last", "")])))
                           for a in item.findall("author")]
                authors = [author for author in authors if author]
                if not title or not abstract or not authors or not item.attrib.get("id"):
                    continue
                anthology_id = f"{YEAR}.{venue}-{volume.attrib.get('id', 'main')}.{item.attrib['id']}"
                paper_url = f"https://aclanthology.org/{anthology_id}/"
                affiliations = [clean("".join(element.itertext())) for element in item.findall("author/affiliation")]
                affiliations = list(dict.fromkeys(a for a in affiliations if a))
                slug = slug_for("acl-anthology", anthology_id)
                yield {
                    "id": stable_id("acl-anthology", anthology_id), "metadata": slug, "slug": slug,
                    "revision": hashlib.sha256(ET.tostring(item, encoding="utf8")).hexdigest()[:16],
                    "pdf": f"https://aclanthology.org/{anthology_id}.pdf", "collection": "conference",
                    "paper": {"title": title, "translatedTitle": "", "authors": authors,
                              "institutions": affiliations, "published": str(YEAR),
                              "venue": f"{volume_name} ({venue.upper()} {YEAR})", "fields": ["自然语言处理"],
                              "keywords": [], "doi": clean(item.findtext("doi", "")), "abstract": abstract,
                              "abstractLabel": "原文摘要", "url": paper_url, "dateKind": "published",
                              "source": {"provider": "ACL Anthology", "id": anthology_id, "url": paper_url}},
                }
                count += 1
        stats[f"{venue.upper()} {YEAR}"] = count


class PmlrVolumes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.anchor = False
        self.href = ""
        self.anchor_text = ""
        self.pending_volume = ""
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.pending_volume = ""
            self.anchor = True
            self.href = dict(attrs).get("href", "")
            self.anchor_text = ""

    def handle_data(self, data):
        text = clean(data)
        if self.anchor:
            self.anchor_text += " " + text
            volume = re.fullmatch(r"Volume\s+(\d+)", self.anchor_text.strip())
            if volume:
                self.pending_volume = volume.group(1)
        elif self.pending_volume and f"Proceedings of ICML {YEAR}" in text:
            self.current = self.pending_volume
            self.pending_volume = ""

    def handle_endtag(self, tag):
        if tag == "a":
            self.anchor = False


def pmlr_papers(stats: dict):
    # The official series index links each current volume to its proceedings bib YAML.
    page = get_bytes("https://proceedings.mlr.press/").decode("utf8")
    index = PmlrVolumes()
    index.feed(page)
    if not index.current:
        stats[f"ICML {YEAR} PMLR"] = "not published yet"
        return
    try:
        import yaml
    except ImportError as error:
        raise RuntimeError("PMLR ingestion needs PyYAML; install requirements-paper-sync.txt") from error
    volume = index.current
    bib_url = f"https://proceedings.mlr.press/v{volume}/assets/bib/citeproc.yaml"
    records = yaml.safe_load(get_bytes(bib_url, 24 * 1024 * 1024)) or []
    count = 0
    for record in records:
        title, abstract = clean(record.get("title")), clean(record.get("abstract"))
        authors = [clean(" ".join(filter(None, [person.get("given"), person.get("family")])))
                   for person in record.get("author", [])]
        authors = [author for author in authors if author]
        paper_url, pdf = clean(record.get("URL")), clean(record.get("PDF"))
        source_id = f"v{volume}/{clean(record.get('id'))}"
        if not title or not abstract or not authors or not re.fullmatch(r"https://proceedings\.mlr\.press/v\d+/[a-zA-Z0-9_-]+\.html", paper_url):
            continue
        if not re.fullmatch(r"https://raw\.githubusercontent\.com/mlresearch/v\d+/(?:main|gh-pages)/assets/[a-zA-Z0-9_/-]+\.pdf", pdf):
            continue
        slug = slug_for("pmlr", source_id)
        yield {
            "id": stable_id("pmlr", source_id), "metadata": slug, "slug": slug,
            "revision": f"v{volume}-{clean(record.get('id'))}", "pdf": pdf, "collection": "conference",
            "paper": {"title": title, "translatedTitle": "", "authors": authors,
                      "institutions": [], "published": str(YEAR), "venue": f"ICML {YEAR}",
                      "fields": ["机器学习"], "keywords": [], "doi": clean(record.get("doi")),
                      "abstract": abstract, "abstractLabel": "原文摘要", "url": paper_url,
                      "dateKind": "published", "source": {"provider": "PMLR", "id": source_id, "url": paper_url}},
        }
        count += 1
    stats[f"ICML {YEAR} PMLR"] = count


def atomic_json(path: Path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=isinstance(data, dict)) + "\n", encoding="utf8")
    temporary.replace(path)


def main():
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf8")) if CATALOG_PATH.exists() else []
    index = json.loads(INDEX_PATH.read_text(encoding="utf8")) if INDEX_PATH.exists() else {}
    existing = {item["id"]: item for item in catalog}
    seen_doi = {clean(paper.get("doi")).casefold() for paper in index.values() if paper.get("doi")}
    seen_title = {re.sub(r"[^\w]", "", clean(paper["title"]).casefold()) for paper in index.values()}
    stats = {}
    for item in [*pmlr_papers(stats), *openreview_papers(stats), *acl_papers(stats)]:
        paper = item.pop("paper")
        doi = clean(paper.get("doi")).casefold()
        title = re.sub(r"[^\w]", "", clean(paper["title"]).casefold())
        prior = existing.get(item["id"])
        if doi and doi in seen_doi and not prior or title in seen_title and not prior:
            continue
        old = index.get(item["metadata"])
        # Preserve user edits across generated catalog refreshes. Personal IndexedDB data
        # never enters this source tree or the sync workflow.
        if old and old.get("source", {}).get("id") == paper["source"]["id"]:
            for key in ("translatedTitle", "institutions", "fields", "keywords"):
                if old.get(key):
                    paper[key] = old[key]
            for key in ("title", "authors", "published", "venue", "doi", "abstract", "url"):
                if old.get(key):
                    paper[key] = old[key]
        index[item["metadata"]] = paper
        existing[item["id"]] = {key: item[key] for key in ("id", "metadata", "slug", "revision", "pdf", "collection")}
        if doi: seen_doi.add(doi)
        seen_title.add(title)
    catalog = sorted(existing.values(), key=lambda item: (item["collection"],
                     index[item["metadata"]].get("published", "9999"), item["metadata"]))
    provenance = {"syncedAt": datetime.now(timezone.utc).isoformat(), "year": YEAR,
                  "sources": stats, "total": len(catalog),
                  "providers": {"OpenReview API v2": ["NeurIPS", "ICML", "ICLR"],
                                "PMLR official citeproc YAML": ["ICML final proceedings"],
                                "ACL Anthology official XML": ["ACL", "EMNLP"]}}
    atomic_json(CATALOG_PATH, catalog)
    atomic_json(INDEX_PATH, index)
    atomic_json(PROVENANCE_PATH, provenance)
    print(json.dumps(provenance, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
