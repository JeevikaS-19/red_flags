"""Knowledge base loading and retrieval for SkillGuard.

Patterns come from malicious_patterns.json (built in Phase 1). Each pattern is
embedded and stored in an in-memory Chroma collection. A skill is split into
overlapping chunks, each chunk is embedded and matched against the collection,
and the best matches across all chunks are returned.
"""

import json
import uuid
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

KB_PATH = Path(__file__).parent / "malicious_patterns.json"
EMBED_MODEL = "all-MiniLM-L6-v2"

CHUNK_SIZE = 1000      # characters per chunk
CHUNK_OVERLAP = 200    # characters shared between neighbouring chunks
MAX_CHUNKS = 30        # cap so very large skills don't blow up cost/latency
TOP_K_PER_CHUNK = 5
TOP_K_PATTERNS = 5

# Chroma metadata values must be scalars, so list fields are stored as JSON strings.
LIST_FIELDS = ("pattern_examples", "indicators")


class KnowledgeBase:
    def __init__(self, kb_path: Path | None = None):
        kb_path = kb_path or KB_PATH
        if not kb_path.exists():
            raise FileNotFoundError(f"{kb_path.name} not found. Phase 1 KB has not been added yet.")

        with kb_path.open(encoding="utf-8") as f:
            kb = json.load(f)
        self.patterns = {p["pattern_id"]: p for p in kb["patterns"]}

        self.model = SentenceTransformer(EMBED_MODEL)
        # Chroma's in-process store is shared, so each KB gets its own collection name.
        self.client = chromadb.EphemeralClient()
        self.collection = self.client.create_collection(
            name=f"skill_patterns_{uuid.uuid4().hex}",
            metadata={"hnsw:space": "cosine"},
        )

        ids, embeddings, metadatas, documents = [], [], [], []
        for pid, pattern in self.patterns.items():
            text = _pattern_text(pattern)
            ids.append(pid)
            embeddings.append(self.model.encode(text).tolist())
            documents.append(text)
            metadatas.append(_to_metadata(pattern))

        self.collection.add(ids=ids, embeddings=embeddings, metadatas=metadatas, documents=documents)

    def retrieve(self, skill_code: str) -> list[dict]:
        """Return the top patterns most similar to any chunk of the skill."""
        chunks = chunk_text(skill_code)
        if not chunks:
            return []

        embeddings = self.model.encode(chunks).tolist()
        results = self.collection.query(
            query_embeddings=embeddings,
            n_results=min(TOP_K_PER_CHUNK, len(self.patterns)),
        )

        # Keep the best (lowest cosine distance) score seen for each pattern across all chunks.
        best: dict[str, float] = {}
        for ids, distances in zip(results["ids"], results["distances"]):
            for pid, dist in zip(ids, distances):
                if pid not in best or dist < best[pid]:
                    best[pid] = dist

        ranked = sorted(best.items(), key=lambda item: item[1])[:TOP_K_PATTERNS]
        return [
            {**self.patterns[pid], "similarity": round(1 - dist, 3)}
            for pid, dist in ranked
        ]


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping character windows, capped at MAX_CHUNKS."""
    text = text.strip()
    if not text:
        return []

    step = CHUNK_SIZE - CHUNK_OVERLAP
    chunks = []
    for start in range(0, len(text), step):
        chunks.append(text[start:start + CHUNK_SIZE])
        if len(chunks) == MAX_CHUNKS:
            break
        if start + CHUNK_SIZE >= len(text):
            break
    return chunks


def _pattern_text(pattern: dict) -> str:
    examples = " ".join(pattern.get("pattern_examples", []))
    return f"{pattern['name']}. {pattern['description']}. {examples}"


def _to_metadata(pattern: dict) -> dict:
    meta = {}
    for key, value in pattern.items():
        if key in LIST_FIELDS:
            meta[key] = json.dumps(value)
        elif value is None:
            meta[key] = ""
        else:
            meta[key] = str(value)
    return meta
