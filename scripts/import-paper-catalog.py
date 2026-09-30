"""Build the reviewed starter catalogue from official metadata (never PDF bytes).

Python 3.11+ and PyYAML 6.x. Network only with --fetch; cached responses are
ignored by Git. Fixed selection/cutoff, deterministic IDs, per-response hashes.
This is an explicit maintenance command, not a browser/startup crawler.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import yaml

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "verification/fixtures/paper-ingest"
CONFIG = json.loads((ROOT / "content/paper-selection.json").read_text(encoding="utf8"))
NS = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
FIELDS = {"cs.AI": "人工智能", "cs.CL": "自然语言处理", "cs.CV": "计算机视觉", "cs.LG": "机器学习", "stat.ML": "机器学习", "cs.RO": "机器人学"}
SOURCES = []
last_request = 0


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"</?[A-Za-z][^>]*>", "", str(value or "")))).strip()


def title_key(value):
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum())


def get(url, fetch):
    global last_request
    key = hashlib.sha256(url.encode()).hexdigest()
    path, info = CACHE / f"{key}.txt", CACHE / f"{key}.json"
    if not path.exists() or not info.exists():
        if not fetch:
            raise RuntimeError(f"Missing metadata cache. Run with --fetch: {url}")
        # arXiv requests are serial and at least 3 seconds apart. No PDF access.
        time.sleep(max(0, 3.2 - (time.monotonic() - last_request)))
        request = urllib.request.Request(url, headers={"User-Agent": "RhineLabUI-Catalog/1.0 (+https://github.com/LBEILC/RhineLabUI)"})
        print(f"Metadata GET {url}", flush=True)
        last_request = time.monotonic()
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read(24 * 1024 * 1024 + 1)
            if len(payload) > 24 * 1024 * 1024 or "pdf" in response.headers.get("Content-Type", "").lower():
                raise RuntimeError("Metadata response exceeded budget or returned PDF")
        path.write_bytes(payload)
        info.write_text(json.dumps({"url": url, "fetchedAt": datetime.now(timezone.utc).isoformat(), "sha256": hashlib.sha256(payload).hexdigest()}), encoding="utf8")
    payload = path.read_bytes()
    provenance = json.loads(info.read_text(encoding="utf8"))
    if provenance["sha256"] != hashlib.sha256(payload).hexdigest():
        raise RuntimeError(f"Cache hash mismatch: {path}")
    SOURCES.append(provenance)
    return payload.decode("utf8")


def metadata(title, authors, published, venue, abstract, url, fields, **extra):
    return {"title": clean(title), "translatedTitle": "", "authors": [clean(a) for a in authors],
            "institutions": [], "published": published, "venue": venue, "fields": fields,
            "keywords": [], "doi": "", "abstract": clean(abstract), "abstractLabel": "原文摘要",
            "url": url, **extra}


def arxiv_records(xml):
    root = ET.fromstring(xml)
    for e in root.findall("a:entry", NS):
        value = lambda tag: e.findtext(tag, default="", namespaces=NS).strip()
        version_id = value("a:id").split("/abs/")[-1]
        if not re.fullmatch(r"(?:\d{4}\.\d{4,5}|[a-z-]+/\d{7})v\d+", version_id):
            raise ValueError(f"Invalid arXiv response entry: {version_id}")
        identifier = re.sub(r"v\d+$", "", version_id)
        categories = [c.attrib["term"] for c in e.findall("a:category", NS)]
        p = metadata(value("a:title"), [a.findtext("a:name", namespaces=NS) for a in e.findall("a:author", NS)],
                     value("a:published")[:10], "预印本／待确认", value("a:summary"), f"https://arxiv.org/abs/{identifier}",
                     list(dict.fromkeys(FIELDS[c] for c in categories if c in FIELDS)),
                     arxivId=identifier, doi=value("x:doi"), dateKind="first-submitted", journalReference=clean(value("x:journal_ref")),
                     source={"provider": "arXiv", "id": identifier, "url": f"https://arxiv.org/abs/{version_id}"})
        p["institutions"] = list(dict.fromkeys(clean(n.text) for n in e.findall("a:author/x:affiliation", NS) if n.text))
        # Categories are fields, not fabricated author keywords. Journal-ref stays
        # provenance until reliably reconciled; never infer acceptance from title.
        yield p, f"https://arxiv.org/pdf/{version_id}", version_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="fetch missing official metadata responses")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    seeds = json.loads((ROOT / "content/paper-seeds.json").read_text(encoding="utf8"))
    seed_metadata = json.loads((ROOT / "content/papers.json").read_text(encoding="utf8"))
    catalog, papers, counts, duplicates = [dict(e, collection="classic") for e in seeds], {}, Counter({"classic": len(seeds)}), []
    seen_titles = {title_key(p["title"]): e["id"] for e in seeds for p in [seed_metadata[e["metadata"]]]}
    seed_arxiv = ["1706.03762", "1810.04805", "1512.03385", "1406.2661", "2006.11239"]
    seen_ids = {f"arxiv:{a}": e["id"] for a, e in zip(seed_arxiv, seeds)}
    seen_doi = {p["doi"].lower(): e["id"] for e in seeds for p in [seed_metadata[e["metadata"]]] if p.get("doi")}

    def add(p, pdf, revision, group):
        if not p["title"] or not p["authors"] or not p["abstract"] or not p["published"] or p["published"] > CONFIG["cutoff"]:
            return False
        source = p["source"]
        canonical = f'{source["provider"].lower()}:{source["id"]}'
        key, doi = title_key(p["title"]), p.get("doi", "").lower()
        duplicate = seen_ids.get(canonical) or seen_titles.get(key) or (seen_doi.get(doi) if doi else None)
        if duplicate:
            duplicates.append({"source": canonical, "kept": duplicate})
            return False
        identity = "paper:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/LBEILC/RhineLabUI/papers/" + canonical))
        slug = re.sub(r"[^a-z0-9]+", "-", canonical).strip("-")
        entry = {"id": identity, "metadata": slug, "slug": slug, "revision": revision, "pdf": pdf, "collection": group}
        catalog.append(entry); papers[slug] = p
        seen_ids[canonical] = identity; seen_titles[key] = identity
        if doi: seen_doi[doi] = identity
        counts[group] += 1
        return True

    ids = list(dict.fromkeys(CONFIG["classicArxivIds"]))
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"id_list": ",".join(ids), "max_results": len(ids)})
    classics = list(arxiv_records(get(url, args.fetch)))
    by_id = {p["arxivId"]: (p, pdf, rev) for p, pdf, rev in classics}
    for identifier in ids:
        if counts["classic"] >= CONFIG["classicsTarget"]: break
        if identifier not in by_id: raise ValueError(f"Missing requested classic {identifier}")
        add(*by_id[identifier], "classic")

    # Deterministic spread across each entire official volume; not a quality ranking.
    def spread(items, count):
        return [items[i * len(items) // count] for i in range(count)]

    xml = ET.fromstring(get(CONFIG["acl"]["url"], args.fetch))
    volume = xml.find(f'volume[@id="{CONFIG["acl"]["volume"]}"]')
    if volume is None:
        raise ValueError("ACL volume missing")
    entries = [e for e in volume.findall("paper") if e.find("abstract") is not None and e.find("title") is not None and e.findall("author")]
    for e in spread(entries, CONFIG["acl"]["count"]):
        value = lambda tag: clean("".join(e.find(tag).itertext())) if e.find(tag) is not None else ""
        identifier = f'{xml.attrib["id"]}-{volume.attrib["id"]}.{e.attrib["id"]}'
        url = f"https://aclanthology.org/{identifier}/"
        authors = [clean(" ".join(a.findtext(tag, "") for tag in ["first", "last"])) for a in e.findall("author")]
        p = metadata(value("title"), authors, "2025-07", "ACL", value("abstract"), url, ["自然语言处理"],
                     doi=value("doi"), dateKind="published", source={"provider": "ACL Anthology", "id": identifier, "url": url})
        p["institutions"] = list(dict.fromkeys(clean("".join(n.itertext())) for n in e.findall("author/affiliation")))
        add(p, f"https://aclanthology.org/{identifier}.pdf", identifier, "conference")

    items = yaml.safe_load(get(CONFIG["icml"]["url"], args.fetch))
    for e in spread(items, CONFIG["icml"]["count"]):
        p = metadata(e["title"], [" ".join(filter(None, [a.get("given"), a.get("family")])) for a in e["author"]],
                     e["published"][:10], "ICML", e["abstract"], e["URL"], ["机器学习"], dateKind="published",
                     source={"provider": "PMLR", "id": f'v267/{e["id"]}', "url": e["URL"]})
        add(p, e["PDF"], f'v267-{e["id"]}', "conference")

    # Round-robin categories prevents the fastest publishing area from taking all slots.
    recent = []
    for category in CONFIG["recentCategories"]:
        query = f'cat:{category} AND submittedDate:[202501010000 TO {CONFIG["cutoff"].replace("-", "")}2359]'
        url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"search_query": query, "start": 0, "max_results": 180, "sortBy": "submittedDate", "sortOrder": "descending"})
        recent.append(list(arxiv_records(get(url, args.fetch))))
    for index in range(max(map(len, recent))):
        for group in recent:
            if counts["recent"] >= CONFIG["recentTarget"]: break
            if index < len(group): add(*group[index], "recent")
    if len(catalog) != CONFIG["target"]:
        raise RuntimeError(f"Expected {CONFIG['target']} qualified records, got {len(catalog)}: {dict(counts)}; output unchanged")
    manifest = {"batch": CONFIG["batch"], "cutoff": CONFIG["cutoff"], "total": len(catalog), "selectionCounts": dict(counts),
                "providerCounts": dict(Counter(p["source"]["provider"] for p in papers.values())),
                "venues": dict(Counter(p["venue"] for p in [*seed_metadata.values(), *papers.values()])),
                "duplicatesSkipped": duplicates, "responses": SOURCES,
                "selection": "100 representative papers including five preserved seeds; 200 evenly spaced ACL 2025 long papers; 200 evenly spaced ICML 2025 papers; 500 recent arXiv papers interleaved across five categories. Not exhaustive or citation-ranked."}
    for filename, data in [("paper-catalog.json", catalog), ("paper-index.json", papers), ("paper-provenance.json", manifest)]:
        path = ROOT / "content" / filename
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        temporary.replace(path)
    print(json.dumps({"total": len(catalog), "counts": dict(counts), "venues": manifest["venues"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
