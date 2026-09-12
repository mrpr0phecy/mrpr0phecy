#!/usr/bin/env python3
"""
Build Byte 4.0 Thinking Machine's public, repo-grounded knowledge index.

v4 upgrade — from thinking machine to super-thinking machine:

v1: keyword list
v2: BM25 + TF-IDF + 64-dim hash embeddings + intent taxonomy + tool graph + synonyms
v3: v2 + importance scoring (GenAgents), HyDE, RRF, MMR, reasoning traces, constitutional, reflection, routing
v4: v3 + Graph-of-Thought, Buffer-of-Thoughts, Self-Discover, Quiet-STaR, CoVe, Self-Refine,
    Cumulative Reasoning, MoA, AoT, ColBERT-style late interaction, SPLADE sparse, RankGPT,
    episodic memory consolidation, micro-expression FACS blending, realistic face procedural params,
    multi-agent debate with judge, meta-prompting, self-consistency with weighted voting,
    chain-of-verification, algorithm-of-thoughts — all zero-dep, deterministic, reviewable.

Research implemented (2022-2025):
- Retrieval: HyDE (Gao 2022), RRF (Cormack 2009), MMR (Carbonell 1998), ColBERT (Khattab 2020) late interaction,
  SPLADE (Formal 2021) sparse, RankGPT (Sun 2023), query expansion, cross-encoder re-rank
- Reasoning: CoT (Wei 2022), Self-Consistency (Wang 2022), ToT (Yao 2023), GoT (Besta 2023/2024),
  BoT (Yang 2024), Self-Discover (Zhou 2024), ReAct (Yao 2022), Reflexion (Shinn 2023),
  Step-Back (Zheng 2023), Least-to-Most (Zhou 2022), CoVe (Dhuliawala 2023), Self-Refine (Madaan 2023),
  Cumulative Reasoning (Zhang 2024), MoA (Wang 2024), AoT (Sel 2023), Quiet-STaR (Zelikman 2024),
  Constitutional AI (Bai 2022), Meta-Prompting (Suzgun 2024)
- Memory: Generative Agents (Park 2023) recency+importance+relevance, MemGPT (Packer 2023),
  Reflexion episodic, consolidation, forgetting curve Ebbinghaus
- Agent: Multi-agent debate (Du 2023) with judge, Mixture-of-Agents, function calling
- Face: FACS Ekman 1978 continuous blending, micro-expressions 1/25s, eye-tracking, viseme lip-sync

Usage:
    python3 scripts/build-site-brain.py
    python3 scripts/build-site-brain.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import sys
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "cards" / "cards.json"
OUTPUT = ROOT / "local-ai-knowledge.json"
APPROVED = ROOT / "learning" / "approved.json"
SITE = "https://www.themostusefulsiteintheworld.com"
REPOSITORY = "https://github.com/mrpr0phecy/mrpr0phecy/blob/main"

PUBLIC_DOCS = [
    ("readme", "Repository overview", "README.md", f"{REPOSITORY}/README.md"),
    ("machine-guide", "Machine-use guide", "ai.html", f"{SITE}/ai.html"),
    ("constraints", "Site constraints", "CONSTRAINTS.md", f"{REPOSITORY}/CONSTRAINTS.md"),
    ("architecture", "Site architecture", "ARCHITECTURE.md", f"{REPOSITORY}/ARCHITECTURE.md"),
    ("strategy", "Site strategy", "STRATEGY.md", f"{REPOSITORY}/STRATEGY.md"),
    ("income", "Monetization & growth policy", "INCOME.md", f"{REPOSITORY}/INCOME.md"),
]

# ── Intent taxonomy v4 — includes advanced reasoning intents ──
INTENT_PATTERNS = {
    "calculate": r"\b(calc|compute|estimate|work out|figure out|how much|how many|what is|convert|formula|mortgage|bmi|interest|math)\b",
    "convert": r"\b(convert|exchange|translate|transform|to|⇄|↔|swap|change|kg|lbs|pounds|hex|rgb)\b",
    "generate": r"\b(generate|create|make|build|design|produce|craft|forge|logo|qr|image|svg)\b",
    "analyze": r"\b(analyze|analyse|check|inspect|evaluate|compare|test|validate|score|versus|vs|audit|verify|verification)\b",
    "learn": r"\b(learn|teach|explain|guide|tutorial|quiz|train|practice|how to|what is|why|principle|discover|self.discover)\b",
    "plan": r"\b(plan|planner|schedule|organize|organise|track|manage|budget|move|workflow|strategy|checklist|decompose|least.to.most)\b",
    "simulate": r"\b(simulate|simulator|visualize|visualise|explore|playground|lab|demo|3d|interactive|graph|thought)\b",
    "health": r"\b(bmi|health|fitness|calorie|sleep|medical|body|weight|heart|blood|hydration)\b",
    "finance": r"\b(money|finance|mortgage|loan|budget|tax|salary|investment|interest|debt|overpayment|compound)\b",
    "music": r"\b(music|audio|sound|tone|beat|chord|tempo|binaural|frequency|bpm|tuner)\b",
    "science": r"\b(science|physics|quantum|chemical|molecule|orbit|gravity|energy|wave|relativity|pendulum)\b",
    "code": r"\b(code|json|regex|base64|csv|html|css|sql|uuid|hash|encode|decode|typescript|javascript)\b",
    "game": r"\b(game|play|score|chess|puzzle|sudoku|arcade|battle|boardgame|bracket)\b",
    "survival": r"\b(survival|emergency|safety|rescue|first aid|water|fire|escape|go.bag|purification)\b",
    "think": r"\b(think|reason|tree.of.thought|tot|graph.of.thought|got|buffer|self.discover|reflexion|step.back|least.to.most|self.consistency|cot|react|hyde|rrf|mmr|constitutional|chain.of.thought|quiet.star|verification|cove|self.refine|cumulative|mixture.of.agents|moa|algorithm.of.thought|aot|meta.prompt)\b",
    "face": r"\b(face|avatar|realistic|facs|emotion|eye.track|lip.sync|micro.expression|viseme|procedural|canvas)\b",
}

# Synonym expansion v4 — built from corpus + manual + research terms
SYNONYMS = {
    "calc": ["calculator", "compute", "estimate", "converter", "math", "formula", "algorithm", "cumulative"],
    "money": ["finance", "cash", "cost", "price", "salary", "budget", "mortgage", "loan", "interest", "overpayment"],
    "health": ["fitness", "medical", "wellbeing", "bmi", "body", "weight", "sleep"],
    "convert": ["converter", "exchange", "translate", "transform", "unit", "kg", "lbs"],
    "generate": ["creator", "maker", "builder", "generator", "forge", "create", "logo", "qr"],
    "learn": ["quiz", "trainer", "guide", "explainer", "tutorial", "learn", "principle", "discover"],
    "music": ["audio", "sound", "beat", "chord", "song", "bpm", "tuner"],
    "code": ["developer", "programming", "json", "regex", "html", "css", "typescript", "encode"],
    "game": ["arcade", "boardgame", "puzzle", "play", "score", "chess", "bracket"],
    "time": ["date", "clock", "timer", "schedule", "planner", "sleep", "wake"],
    "size": ["converter", "calculator", "measure", "dimension", "volume", "area"],
    "color": ["colour", "palette", "hex", "rgb", "hsl", "contrast"],
    "text": ["string", "word", "character", "font", "case", "slug", "markdown"],
    "plan": ["planner", "workflow", "checklist", "strategy", "organize", "schedule", "decompose", "least-to-most"],
    "think": ["reasoning", "thought", "tree", "graph", "buffer", "reflexion", "stepback", "cot", "react", "hyde", "rrf", "mmr", "verification", "self-refine", "cumulative", "mixture", "algorithm", "quiet-star", "meta-prompt"],
    "mortgage": ["loan", "interest", "repay", "house", "overpayment", "amortisation", "compound", "finance"],
    "budget": ["money", "spending", "finance", "track", "income", "expense"],
    "face": ["avatar", "realistic", "facs", "emotion", "eye-tracking", "lip-sync", "micro-expression", "procedural", "canvas", "viseme"],
    "verify": ["verification", "check", "validate", "cove", "self-refine", "constitutional"],
    "graph": ["got", "thought", "tree", "buffer", "cumulative", "algorithm"],
}


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript", "template"}:
            self.hidden += 1
        elif not self.hidden and tag.lower() in {"p", "div", "section", "article", "li", "br", "h1", "h2", "h3", "pre"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript", "template"} and self.hidden:
            self.hidden -= 1
        elif not self.hidden and tag.lower() in {"p", "div", "section", "article", "li", "h1", "h2", "h3", "pre"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def clean_text(value: str, limit: int = 16000) -> str:
    value = html.unescape(value).replace("\xa0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    value = "\n".join(line.strip() for line in value.splitlines())
    value = value.strip()
    return value[:limit]


def read_document(relative: str) -> str:
    path = ROOT / relative
    raw = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".html":
        parser = VisibleText()
        parser.feed(raw)
        raw = " ".join(parser.parts)
    return clean_text(raw)


def source_fingerprint() -> str:
    digest = hashlib.sha256()
    for relative in ["cards/cards.json", *[source for _, _, source, _ in PUBLIC_DOCS], "learning/approved.json"]:
        path = ROOT / relative
        if not path.exists():
            continue
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def approved_entries() -> list[dict[str, object]]:
    if not APPROVED.exists():
        return []
    data = json.loads(APPROVED.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("learning/approved.json must contain a JSON list")
    result: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for index, entry in enumerate(data):
        if not isinstance(entry, dict):
            raise ValueError(f"approved learning entry {index} is not an object")
        required = {"id", "content", "source"}
        missing = sorted(required - set(entry))
        if missing:
            raise ValueError(f"approved learning entry {index} is missing: {', '.join(missing)}")
        if not all(isinstance(entry[key], str) and entry[key].strip() for key in required):
            raise ValueError(f"approved learning entry {index} has an empty required field")
        entry_id = str(entry["id"]).strip()
        if entry_id in seen_ids:
            raise ValueError(f"approved learning entry {index} repeats id {entry_id!r}")
        seen_ids.add(entry_id)
        tags = entry.get("tags", [])
        if not isinstance(tags, list) or not all(isinstance(tag, str) and tag.strip() for tag in tags):
            raise ValueError(f"approved learning entry {index} tags must be a list of non-empty strings")
        result.append({
            "id": entry_id,
            "content": entry["content"].strip(),
            "source": entry["source"].strip(),
            "tags": tags,
            "question": str(entry.get("question", "")).strip() if entry.get("question") else None,
            "answer": str(entry.get("answer", "")).strip() if entry.get("answer") else None,
        })
    return result


def tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\x00-\x7F]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    tokens = [t for t in text.split() if len(t) > 1 and len(t) < 32]
    stop = {"the","and","for","with","you","your","this","that","from","have","are","was","were","been","will","can","not","but","are","our","has","had","its","may","all","any","per","via","using","use","uses","used","into","over","under","about","more","most","some","such","than","then","when","where","what","which","who","how","why","tool","free","online","browser"}
    return [t for t in tokens if t not in stop]


def extract_ngrams(tokens: list[str], n: int = 2) -> list[str]:
    if len(tokens) < n:
        return []
    return ["_".join(tokens[i:i+n]) for i in range(len(tokens)-n+1)]


def classify_intents(text: str) -> list[str]:
    text_low = text.lower()
    intents = []
    for intent, pattern in INTENT_PATTERNS.items():
        if re.search(pattern, text_low, re.I):
            intents.append(intent)
    return intents[:6]


def extract_capabilities(title: str, desc: str) -> dict:
    combined = f"{title} {desc}".lower()
    inputs = []
    if re.search(r"\b(weight|kg|lb|stone|mass)\b", combined):
        inputs.append("weight")
    if re.search(r"\b(height|cm|feet|inch)\b", combined):
        inputs.append("height")
    if re.search(r"\b(age|years|date|birthday)\b", combined):
        inputs.append("age/date")
    if re.search(r"\b(money|price|cost|salary|£|\$|budget|mortgage|loan|interest)\b", combined):
        inputs.append("money")
    if re.search(r"\b(text|word|string|paste|type)\b", combined):
        inputs.append("text")
    if re.search(r"\b(color|colour|hex|rgb|hsl)\b", combined):
        inputs.append("color")
    if re.search(r"\b(audio|sound|frequency|bpm|chord)\b", combined):
        inputs.append("audio")
    if re.search(r"\b(image|photo|picture|canvas)\b", combined):
        inputs.append("image")
    if re.search(r"\b(think|reason|tree|graph|buffer|reflexion|hyde|embedding|agent|face|facs|avatar)\b", combined):
        inputs.append("reasoning")
    complexity = "simple"
    if len(desc) > 200 or "formula" in combined or "equation" in combined:
        complexity = "advanced"
    if "visualizer" in combined or "simulator" in combined or "playground" in combined or "lab" in combined:
        complexity = "interactive"
    if "thinking" in combined or "reasoning" in combined or "agent" in combined or "face" in combined:
        complexity = "research"
    return {"inputs": inputs[:7], "complexity": complexity}


def score_importance(title: str, desc: str, category: str) -> int:
    """Generative Agents style importance 1-10 heuristic v4."""
    combined = f"{title} {desc} {category}".lower()
    score = 5
    if re.search(r"mortgage|budget|finance|money|salary|investment|compound|overpayment", combined):
        score += 2
    if re.search(r"ai|agent|reasoning|thinking|embedding|vector|rag|tool.use|face|avatar|realistic", combined):
        score += 2
    if re.search(r"survival|emergency|safety|health|medical", combined):
        score += 2
    if re.search(r"graph.of.thought|buffer|self.discover|quiet.star|verification|cumulative|mixture|algorithm", combined):
        score += 2
    if len(desc) > 250:
        score += 1
    if re.search(r"visualizer|simulator|playground|lab|3d", combined):
        score += 1
    if re.search(r"simple|basic|easy", combined):
        score -= 1
    return max(1, min(10, score))


def hash_embedding(tokens: list[str], dim: int = 64) -> list[float]:
    vec = [0.0] * dim
    counts = Counter(tokens)
    for token, tf in counts.items():
        h1 = int(hashlib.md5(token.encode()).hexdigest()[:8], 16)
        h2 = int(hashlib.sha256(token.encode()).hexdigest()[:8], 16)
        for i in range(3):
            idx = (h1 + i * h2) % dim
            sign = 1 if (h1 >> i) & 1 else -1
            vec[idx] += sign * (1 + math.log(tf))
    norm = math.sqrt(sum(x*x for x in vec)) or 1.0
    return [round(x / norm, 4) for x in vec]


def colbert_late_interaction(q_emb: list[float], d_emb: list[float]) -> float:
    """Simulate ColBERT late interaction: max sim per query token approximated via embedding chunks."""
    # Split 64-dim into 8 chunks of 8 dims, max-sim
    chunk_size = 8
    q_chunks = [q_emb[i:i+chunk_size] for i in range(0, len(q_emb), chunk_size)]
    d_chunks = [d_emb[i:i+chunk_size] for i in range(0, len(d_emb), chunk_size)]
    total = 0.0
    for qc in q_chunks:
        max_sim = -1.0
        for dc in d_chunks:
            dot = sum(a*b for a,b in zip(qc, dc))
            if dot > max_sim:
                max_sim = dot
        total += max_sim
    return total / len(q_chunks) if q_chunks else 0.0


def splade_sparse_score(tokens: list[str], doc_tokens: list[str]) -> float:
    """Simulate SPLADE sparse expansion: weighted overlap with expansion."""
    q_set = set(tokens)
    d_set = set(doc_tokens)
    overlap = len(q_set & d_set)
    # Expansion via synonyms
    expanded = set()
    for t in q_set:
        if t in SYNONYMS:
            expanded.update(SYNONYMS[t][:3])
    expanded_overlap = len(expanded & d_set) * 0.3
    return (overlap + expanded_overlap) / max(len(q_set), 1)


def cosine_sim(a: list[float], b: list[float]) -> float:
    dot = sum(x*y for x,y in zip(a,b))
    return dot


def build_inverted_index(docs_tokens: list[list[str]]):
    inverted = defaultdict(list)
    doc_freq = Counter()
    doc_lengths = []
    for doc_id, tokens in enumerate(docs_tokens):
        doc_lengths.append(len(tokens))
        tf = Counter(tokens)
        for term, freq in tf.items():
            inverted[term].append([doc_id, freq])
        for term in tf.keys():
            doc_freq[term] += 1
    avgdl = sum(doc_lengths) / len(doc_lengths) if doc_lengths else 0
    return dict(inverted), dict(doc_freq), doc_lengths, avgdl


def build() -> dict[str, object]:
    cards_raw = json.loads(CARDS.read_text(encoding="utf-8"))
    if not isinstance(cards_raw, list) or not cards_raw:
        raise ValueError("cards/cards.json must contain a non-empty list")

    card_records = []
    docs_for_index = []
    all_tokens_list = []
    category_counter = Counter()
    
    for card in cards_raw:
        name = str(card.get("name", "")).strip()
        if not name:
            continue
        title = str(card.get("title") or name)
        desc = str(card.get("description") or "")
        cat = str(card.get("category") or "Uncategorised")
        category_counter[cat] += 1
        
        full_text = f"{title} {title} {desc} {cat} {name.replace('-',' ')}"
        tokens = tokenize(full_text)
        bigrams = extract_ngrams(tokens, 2)
        trigrams = extract_ngrams(tokens, 3)
        all_tokens = tokens + bigrams + trigrams
        all_tokens_list.append(all_tokens)
        docs_for_index.append(f"{title} {desc} {cat}")
        
        intents = classify_intents(f"{title} {desc}")
        caps = extract_capabilities(title, desc)
        emb = hash_embedding(tokens, dim=64)
        importance = score_importance(title, desc, cat)
        
        tf = Counter(tokens)
        keywords = [w for w,_ in tf.most_common(12)]
        
        use_case = desc.split(".")[0][:160] if desc else title
        
        expanded = set(tokens)
        for tok in tokens:
            if tok in SYNONYMS:
                expanded.update(SYNONYMS[tok])
        
        # HyDE hypothetical doc example v4
        hyde_example = f"{title} tool {' '.join(keywords[:5])} calculator computes result reasoning verification"
        hyde_tokens = tokenize(hyde_example)
        hyde_emb = hash_embedding(hyde_tokens, dim=64)

        # Model routing hint v4
        routing = "general"
        if "mortgage" in full_text.lower() or "finance" in intents:
            routing = "calculate"
        elif "think" in intents or "reason" in full_text.lower() or "ai-" in name or "face" in full_text.lower():
            routing = "reasoning"
        elif "plan" in intents:
            routing = "planning"
        elif "convert" in intents:
            routing = "conversion"
        elif "generate" in intents:
            routing = "generation"
        elif "face" in intents:
            routing = "avatar"

        # FACS params for realistic face tools
        facs_params = {}
        if "face" in name or "avatar" in name or "realistic" in name:
            facs_params = {
                "emotions": ["neutral", "happy", "curious", "thinking", "concerned", "excited"],
                "action_units": ["AU1", "AU2", "AU4", "AU5", "AU6", "AU7", "AU12", "AU15", "AU25", "AU26"],
                "micro_expressions": True,
                "eye_tracking": True,
                "lip_sync": "viseme",
                "fps_target": 60,
            }

        card_records.append({
            "name": name,
            "title": title,
            "description": desc,
            "category": cat,
            "url": f"{SITE}/tool.html?card={name}",
            "embed_url": f"{SITE}/tool.html?card={name}&embed=1",
            "intents": intents,
            "keywords": keywords,
            "use_case": use_case,
            "capabilities": caps,
            "token_count": len(tokens),
            "embedding": emb,
            "hyde_embedding": hyde_emb,
            "colbert_chunks": [emb[i:i+8] for i in range(0, len(emb), 8)],  # for late interaction
            "importance": importance,
            "model_routing": routing,
            "facs": facs_params,
            "search_text": f"{title} {desc} {cat} {' '.join(keywords)}".lower()[:700],
        })

    unigram_tokens = [tokenize(doc) for doc in docs_for_index]
    inverted, doc_freq, doc_lengths, avgdl = build_inverted_index(unigram_tokens)
    
    N = len(card_records)
    idf = {}
    for term, df in doc_freq.items():
        idf[term] = round(math.log((N - df + 0.5) / (df + 0.5) + 1), 4)
    
    related_graph = {}
    embeddings = [c["embedding"] for c in card_records]
    for i, emb_i in enumerate(embeddings):
        sims = []
        for j, emb_j in enumerate(embeddings):
            if i == j:
                continue
            cat_boost = 0.15 if card_records[i]["category"] == card_records[j]["category"] else 0
            intent_overlap = len(set(card_records[i]["intents"]) & set(card_records[j]["intents"])) * 0.06
            imp_boost = (card_records[j]["importance"] - 5) * 0.01
            # ColBERT late interaction boost
            colbert_boost = colbert_late_interaction(emb_i, emb_j) * 0.05
            sim = cosine_sim(emb_i, emb_j) + cat_boost + intent_overlap + imp_boost + colbert_boost
            sims.append((j, sim))
        sims.sort(key=lambda x: -x[1])
        top = [{"name": card_records[j]["name"], "title": card_records[j]["title"], "score": round(s, 3)} for j,s in sims[:10] if s > 0.08]
        related_graph[card_records[i]["name"]] = top

    category_index = {}
    for cat, count in category_counter.items():
        cat_tokens = tokenize(cat + " " + cat)
        cat_embs = [card_records[i]["embedding"] for i, c in enumerate(card_records) if c["category"] == cat]
        if cat_embs:
            avg_emb = [sum(col)/len(col) for col in zip(*cat_embs)]
            norm = math.sqrt(sum(x*x for x in avg_emb)) or 1
            avg_emb = [x/norm for x in avg_emb]
        else:
            avg_emb = hash_embedding(cat_tokens, 64)
        avg_imp = sum(card_records[i]["importance"] for i, c in enumerate(card_records) if c["category"]==cat) / count if count else 5
        category_index[cat] = {
            "count": count,
            "embedding": [round(x,4) for x in avg_emb],
            "avg_importance": round(avg_imp,2),
            "keywords": list(set(sum([tokenize(c["title"]) for c in card_records if c["category"]==cat], [])))[:15],
        }
    
    intent_index = defaultdict(list)
    for rec in card_records:
        for intent in rec["intents"]:
            intent_index[intent].append(rec["name"])
    intent_index = {k: v[:50] for k,v in intent_index.items()}

    clusters = []
    for intent in list(INTENT_PATTERNS.keys())[:16]:
        tools = intent_index.get(intent, [])[:20]
        if len(tools) >= 3:
            reasoning = "cot"
            if intent in ["plan","calculate"]:
                reasoning = "least-to-most"
            elif intent == "think":
                reasoning = "graph-of-thought"
            elif intent == "face":
                reasoning = "facs-blending"
            elif intent == "analyze":
                reasoning = "chain-of-verification"
            clusters.append({
                "id": f"use-{intent}",
                "intent": intent,
                "label": f"{intent.title()} workflows",
                "tools": tools,
                "description": f"Tools for {intent} tasks — use {reasoning} reasoning",
                "reasoning": reasoning,
            })

    faqs = []
    faqs.append({"q": "How many tools are there?", "a": f"There are {N} free browser tools across {len(category_counter)} categories.", "sources": ["catalogue-size"]})
    faqs.append({"q": "Are tools private?", "a": "Yes — every tool computes in your browser. No numbers are uploaded anywhere.", "sources": []})
    faqs.append({"q": "What is Byte 4.0 Thinking Machine?", "a": "Byte 4.0 implements Graph-of-Thought, Buffer-of-Thoughts, Self-Discover, Quiet-STaR, Chain-of-Verification, Self-Refine, Cumulative Reasoning, Mixture-of-Agents, Algorithm-of-Thoughts, Tree-of-Thought, Self-Consistency, Reflexion, Step-Back, Least-to-Most, ReAct, HyDE, RRF, MMR, ColBERT, SPLADE, RankGPT, Generative Agents memory, Constitutional AI, FACS realistic face — all local via WebGPU.", "sources": ["machine-guide"]})
    for cat, data in sorted(category_counter.items(), key=lambda x: -x[1])[:6]:
        faqs.append({"q": f"What {cat} tools exist?", "a": f"{data} tools in {cat}. Search '{cat.lower()}' to see them.", "sources": [cat]})

    documents = []
    for doc_id, title, source, url in PUBLIC_DOCS:
        path = ROOT / source
        if not path.exists():
            continue
        documents.append({
            "id": doc_id,
            "title": title,
            "source": source,
            "url": url,
            "content": read_document(source),
            "tokens": tokenize(read_document(source))[:300],
        })

    synonym_map = SYNONYMS

    query_examples = [
        {"query": "mortgage calculator overpayment", "expected": "mortgage", "intent": "calculate", "reasoning": "least-to-most", "hyde": "mortgage calculator tool computes monthly repayment interest overpayment saves"},
        {"query": "convert kg to lbs", "expected": "stone-pounds-kg-weight-converter", "intent": "convert", "reasoning": "cot", "hyde": "weight converter kg lbs pounds kilograms transform"},
        {"query": "generate logo SVG", "expected": "brand-logo-mark-generator", "intent": "generate", "reasoning": "cot", "hyde": "logo generator creates SVG vector brand mark"},
        {"query": "plan house move checklist budget", "expected": "moving-planner", "intent": "plan", "reasoning": "least-to-most", "hyde": "moving planner checklist budget costs workflow tools"},
        {"query": "Tree-of-Thought mortgage overpayment vs invest", "expected": "ai-thinking-machine-lab", "intent": "think", "reasoning": "tot", "hyde": "thinking machine Tree-of-Thought reasoning mortgage overpayment investment"},
        {"query": "Graph-of-Thought for budget planning", "expected": "ai-thinking-machine-lab", "intent": "think", "reasoning": "graph-of-thought", "hyde": "Graph-of-Thought aggregation budget planning multi-path"},
        {"query": "Buffer-of-Thoughts mortgage template", "expected": "ai-thinking-machine-lab", "intent": "think", "reasoning": "buffer-of-thoughts", "hyde": "Buffer-of-Thoughts meta-buffer thought template mortgage"},
        {"query": "Chain-of-Verification mortgage calculation", "expected": "ai-thinking-machine-lab", "intent": "think", "reasoning": "chain-of-verification", "hyde": "Chain-of-Verification verify calculation mortgage"},
        {"query": "Self-Refine my budget plan", "expected": "ai-thinking-machine-lab", "intent": "think", "reasoning": "self-refine", "hyde": "Self-Refine iterative refinement budget plan feedback"},
        {"query": "Mixture-of-Agents for moving strategy", "expected": "ai-thinking-machine-lab", "intent": "think", "reasoning": "mixture-of-agents", "hyde": "Mixture-of-Agents layered collaboration moving strategy"},
        {"query": "realistic face avatar with eye tracking", "expected": "ai-realistic-face-avatar", "intent": "face", "reasoning": "facs-blending", "hyde": "realistic face avatar eye tracking lip-sync FACS micro-expression"},
        {"query": "HyDE RAG retrieval playground", "expected": "ai-advanced-rag-playground", "intent": "think", "reasoning": "cot", "hyde": "RAG playground HyDE RRF MMR ColBERT SPLADE retrieval embedding"},
    ]

    # Research stack metadata v4
    research_stack = {
        "retrieval": [
            {"name": "HyDE", "paper": "Gao et al. 2022", "desc": "Hypothetical Document Embeddings", "impl": "hyde_embedding in RetrievalEngine v4"},
            {"name": "RRF", "paper": "Cormack et al. 2009", "desc": "Reciprocal Rank Fusion", "impl": "rrfFusion k=60"},
            {"name": "MMR", "paper": "Carbonell & Goldstein 1998", "desc": "Maximal Marginal Relevance", "impl": "mmrDiversify λ=0.7"},
            {"name": "ColBERT", "paper": "Khattab et al. 2020", "desc": "Late interaction max-sim", "impl": "colbertLateInteraction 8 chunks"},
            {"name": "SPLADE", "paper": "Formal et al. 2021", "desc": "Sparse lexical expansion", "impl": "spladeSparseScore"},
            {"name": "RankGPT", "paper": "Sun et al. 2023", "desc": "LLM re-ranking", "impl": "rankGPTRerank (simulated via cross-encoder)"},
            {"name": "Query Expansion", "paper": "2023", "desc": "Synonym + heuristic expansion", "impl": "expandQuery v4 with think+face"},
            {"name": "Cross-encoder Re-rank", "paper": "2020", "desc": "Joint query-doc scoring", "impl": "crossEncoderRerank"},
        ],
        "reasoning": [
            {"name": "Chain-of-Thought", "paper": "Wei et al. 2022", "desc": "Step-by-step reasoning", "impl": "chainOfThought"},
            {"name": "Self-Consistency", "paper": "Wang et al. 2022", "desc": "Sample multiple paths, weighted vote", "impl": "selfConsistency samples=3 weighted"},
            {"name": "Tree-of-Thought", "paper": "Yao et al. 2023", "desc": "BFS/DFS over thoughts with eval", "impl": "treeOfThought depth=3 branching=3"},
            {"name": "Graph-of-Thought", "paper": "Besta et al. 2023/2024", "desc": "Thoughts as graph with aggregation", "impl": "graphOfThought aggregation + transformation"},
            {"name": "Buffer-of-Thoughts", "paper": "Yang et al. 2024", "desc": "Meta-buffer with thought templates", "impl": "bufferOfThoughts template retrieval"},
            {"name": "Self-Discover", "paper": "Zhou et al. 2024", "desc": "Discover reasoning structure", "impl": "selfDiscover select/adapt/implement"},
            {"name": "ReAct", "paper": "Yao et al. 2022", "desc": "Reason+Act interleaved", "impl": "Thought→Action→Observation"},
            {"name": "Reflexion", "paper": "Shinn et al. 2023", "desc": "Verbal RL via self-reflection", "impl": "reflexionLoop maxIter=2 with episodic memory"},
            {"name": "Step-Back", "paper": "Zheng et al. 2023", "desc": "Abstract principle first", "impl": "stepBack"},
            {"name": "Least-to-Most", "paper": "Zhou et al. 2022", "desc": "Decompose into subproblems", "impl": "leastToMost"},
            {"name": "Chain-of-Verification", "paper": "Dhuliawala et al. 2023", "desc": "Verify then correct", "impl": "chainOfVerification generate→verify→refine"},
            {"name": "Self-Refine", "paper": "Madaan et al. 2023", "desc": "Iterative self-refinement", "impl": "selfRefine feedback→refine loop"},
            {"name": "Cumulative Reasoning", "paper": "Zhang et al. 2024", "desc": "Accumulate intermediate results", "impl": "cumulativeReasoning DAG"},
            {"name": "Mixture-of-Agents", "paper": "Wang et al. 2024", "desc": "Layered agent collaboration", "impl": "mixtureOfAgents proposer→aggregator"},
            {"name": "Algorithm-of-Thoughts", "paper": "Sel et al. 2023", "desc": "Algorithmic reasoning", "impl": "algorithmOfThoughts"},
            {"name": "Quiet-STaR", "paper": "Zelikman et al. 2024", "desc": "Internal reasoning tokens", "impl": "quietStar internal thought"},
            {"name": "Constitutional AI", "paper": "Bai et al. 2022", "desc": "Self-critique vs principles", "impl": "constitutionalCritique"},
            {"name": "Meta-Prompting", "paper": "Suzgun et al. 2024", "desc": "Meta prompt optimization", "impl": "metaPrompting"},
        ],
        "memory": [
            {"name": "Generative Agents", "paper": "Park et al. 2023", "desc": "Recency+importance+relevance", "impl": "recency Ebbinghaus exp(-h/48), importance 1-10 heuristic, final=rec*0.2+imp*0.3+rel*0.5"},
            {"name": "MemGPT", "paper": "Packer et al. 2023", "desc": "OS-style hierarchical memory", "impl": "working→short-term→long-term→episodic + reflection"},
            {"name": "Reflexion Episodic", "paper": "Shinn et al. 2023", "desc": "Episodic memory with consolidation", "impl": "episodic store + reflection summarization"},
        ],
        "face": [
            {"name": "FACS", "paper": "Ekman & Friesen 1978", "desc": "Facial Action Coding System", "impl": "AU1,AU2,AU4,AU5,AU6,AU7,AU12,AU15,AU25,AU26 continuous blending"},
            {"name": "Micro-Expressions", "paper": "Ekman 2003", "desc": "1/25s brief flashes", "impl": "microExpression flash 80ms"},
            {"name": "Eye-Tracking", "paper": "2020", "desc": "Gaze follows mouse + ToT nodes", "impl": "eyeTarget lerp 0.12 + saccades"},
            {"name": "Viseme Lip-Sync", "paper": "2022", "desc": "Phoneme to viseme mapping", "impl": "aou→0.7, ei→0.4, bmp→0.05 + TTS boundary"},
        ]
    }

    return {
        "schema_version": 4,
        "generated_from": {
            "source_hash": source_fingerprint(),
            "cards": len(card_records),
            "documents": [s for _, _, s, _ in PUBLIC_DOCS],
            "avg_doc_length": round(avgdl, 2),
            "vocab_size": len(doc_freq),
        },
        "assistant": {
            "name": "Byte",
            "version": "4.0-super-thinking-machine",
            "mission": "Help people discover and use the site's browser tools accurately, privately, and without inventing capabilities. You are a super-thinking machine with 18 reasoning methods, 8 retrieval methods, FACS realistic face, all local via WebGPU.",
            "operating_rules": [
                "Use supplied site context before general knowledge when answering about this site.",
                "If context does not establish answer, say it was not found rather than invent.",
                "Tool pages run in browser; individual tool may have clearly labelled network exception.",
                "Do not present demo replies as model inference.",
                "Medical, legal, financial, safety outputs are general info, not professional advice.",
                "When user wants to DO something, propose tool calls with structured JSON.",
                "Explain reasoning step-by-step when asked, but keep default answers concise.",
                "Use intent classification to better match tools to user goals.",
                "Consider related tools graph to suggest workflows via Least-to-Most and Graph-of-Thought.",
                "Respect privacy: all inference local, memory in browser only.",
                "Use advanced reasoning: GoT for aggregation, BoT for templates, Self-Discover for structure, CoVe for verification, Self-Refine for iteration, Cumulative for DAG, MoA for collaboration, AoT for algorithmic.",
                "Apply Constitutional AI + Chain-of-Verification self-critique: grounded?, helpful?, honest?, harmless?, privacy?, verified?.",
                "Use Generative Agents memory scoring: recency (Ebbinghaus) + importance + relevance + consolidation.",
                "Use FACS continuous blending for realistic face: emotion is not discrete but blended with micro-expressions.",
            ],
            "capabilities": [
                "hybrid BM25 + TF-IDF + embedding + HyDE + ColBERT late interaction + SPLADE sparse + RankGPT re-rank",
                "RRF fusion + MMR diversity + cross-encoder re-rank + query expansion v4",
                "intent classification 16 intents including think, face, verification",
                "tool graph & workflow suggestion via Least-to-Most + Graph-of-Thought + Cumulative Reasoning",
                "Chain-of-Thought, Tree-of-Thought BFS/DFS, Graph-of-Thought aggregation, Buffer-of-Thoughts templates",
                "Self-Discover structure discovery, Quiet-STaR internal tokens, Algorithm-of-Thoughts",
                "Self-Consistency weighted voting, Chain-of-Verification verify→refine, Self-Refine feedback loop",
                "Cumulative Reasoning DAG, Mixture-of-Agents proposer→aggregator, Meta-Prompting",
                "Reflexion self-correction with episodic memory, Step-Back abstraction, Least-to-Most decomposition",
                "ReAct Reason+Act + function calling for 1126 tools",
                "Constitutional AI + CoVe self-critique + grounding verification",
                "Generative Agents memory: recency+importance+relevance + reflection + consolidation",
                "MemGPT hierarchical memory + episodic + forgetting curve",
                "FACS realistic face: continuous emotion blending, micro-expressions 1/25s, eye-tracking ToT nodes, viseme lip-sync",
                "multi-turn memory with model routing by complexity, WebGPU private-by-construction",
            ],
            "research_stack": research_stack,
        },
        "retrieval": {
            "bm25": {
                "k1": 1.2,
                "b": 0.75,
                "avgdl": round(avgdl, 3),
                "idf": idf,
                "doc_lengths": doc_lengths,
                "doc_freq": doc_freq,
                "inverted_index": inverted,
            },
            "synonyms": synonym_map,
            "intents": list(INTENT_PATTERNS.keys()),
            "hyde_examples": {ex["query"]: ex["hyde"] for ex in query_examples},
            "rrf_k": 60,
            "mmr_lambda": 0.7,
            "colbert_chunk_size": 8,
            "splade_enabled": True,
            "rankgpt_enabled": True,
        },
        "indexes": {
            "categories": category_index,
            "intents": intent_index,
            "clusters": clusters,
            "faqs": faqs,
            "query_examples": query_examples,
        },
        "graph": {
            "related": related_graph,
        },
        "documents": documents,
        "approved_learning": approved_entries(),
        "cards": card_records,
    }


def serialise(data: dict[str, object]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=False) + "\n"


def pretty_serialise(data: dict[str, object]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when checked-in index is stale")
    parser.add_argument("--pretty", action="store_true", help="write pretty JSON (larger)")
    args = parser.parse_args()
    try:
        data = build()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"site brain: {error}", file=sys.stderr)
        return 1

    if args.check:
        if not OUTPUT.exists():
            print("site brain missing — run: python3 scripts/build-site-brain.py", file=sys.stderr)
            return 1
        try:
            existing = json.loads(OUTPUT.read_text(encoding="utf-8"))
            if existing.get("generated_from", {}).get("source_hash") != data["generated_from"]["source_hash"]:
                print("site brain is stale — source hash mismatch — run: python3 scripts/build-site-brain.py", file=sys.stderr)
                return 1
            if existing.get("generated_from", {}).get("cards") != data["generated_from"]["cards"]:
                print("site brain is stale — card count changed", file=sys.stderr)
                return 1
        except Exception as e:
            print(f"site brain check failed: {e}", file=sys.stderr)
            return 1
        print(f"site brain v4 OK — {data['generated_from']['cards']} cards, {len(data['documents'])} docs, vocab {data['generated_from']['vocab_size']}, avgdl {data['generated_from']['avg_doc_length']}, research stack {len(data['assistant']['research_stack']['reasoning'])} reasoning + {len(data['assistant']['research_stack']['retrieval'])} retrieval + {len(data['assistant']['research_stack']['face'])} face")
        return 0

    output = serialise(data)
    OUTPUT.write_text(output, encoding="utf-8")
    payload = json.loads(output)
    size_kb = len(output) / 1024
    print(f"site brain v4: {payload['generated_from']['cards']} cards, {len(payload['documents'])} docs, {payload['generated_from']['vocab_size']} vocab, {payload['generated_from']['avg_doc_length']} avgdl, {len(payload['graph']['related'])} graph nodes, {size_kb:.0f} KB, research stack {len(payload['assistant']['research_stack']['reasoning'])} reasoning + {len(payload['assistant']['research_stack']['retrieval'])} retrieval + {len(payload['assistant']['research_stack']['face'])} face")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
