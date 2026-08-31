"""
RAG / knowledge base retrieval.

Fallback vector store for local/demo mode: TF-IDF + cosine similarity over
the seeded policy documents. Swappable for pgvector/embeddings in a real
deployment without changing the retrieval interface (`search`).
"""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from .knowledge_seed import DOCS


class KnowledgeBase:
    def __init__(self, docs=None):
        self.docs = docs or DOCS
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.matrix = self.vectorizer.fit_transform([d["content"] for d in self.docs])

    def search(self, query: str, top_k: int = 2):
        if not query.strip():
            return []
        q_vec = self.vectorizer.transform([query])
        sims = cosine_similarity(q_vec, self.matrix).flatten()
        ranked = sorted(range(len(sims)), key=lambda i: -sims[i])[:top_k]
        results = []
        for i in ranked:
            if sims[i] <= 0:
                continue
            results.append(dict(
                title=self.docs[i]["title"],
                category=self.docs[i]["category"],
                content=self.docs[i]["content"],
                score=round(float(sims[i]), 4),
            ))
        return results


_kb_instance = None


def get_kb():
    global _kb_instance
    if _kb_instance is None:
        _kb_instance = KnowledgeBase()
    return _kb_instance
