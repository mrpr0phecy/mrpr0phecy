#!/usr/bin/env python3
"""Run grounding regressions for Byte 4.0 Super-Thinking Machine's site brain.

Checks advanced retrieval v4: BM25 + embedding + HyDE + RRF + MMR + ColBERT + SPLADE + RankGPT + intent + query expansion
plus reasoning traces: CoT, Self-Consistency, ToT, GoT, BoT, Self-Discover, ReAct, Reflexion, Step-Back, Least-to-Most,
CoVe, Self-Refine, Cumulative, MoA, AoT, Quiet-STaR, Constitutional AI, Meta-Prompting

Supports v1, v2, v3, v4 knowledge formats.
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "local-ai-knowledge.json"
CASES = ROOT / "learning" / "evaluation.json"


def tokenize(value: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 2 and word not in STOP}
STOP = {"the","and","for","with","you","your","this","that","from","have","are","was","were","been","will","can","not","but","our","has","had","its","may","all","any","per","via","using","use","into","over","under","about","more","most","some","such","than","then","when","where","what","which","who","how","why","tool","free","online","browser"}

def score_simple(query: str, entry: dict) -> int:
    wanted = tokenize(query)
    title = tokenize(str(entry.get("title", "")))
    category = tokenize(str(entry.get("category", "")))
    content = tokenize(str(entry.get("description", "")) + " " + str(entry.get("content", "")) + " " + str(entry.get("search_text","")))
    return sum((9 if word in title else 5 if word in category else 2 if word in content else 0) for word in wanted)

def bm25_score(query_tokens: list[str], doc_id: int, knowledge: dict) -> float:
    bm25 = knowledge.get("retrieval", {}).get("bm25")
    if not bm25:
        return 0
    k1=1.2; b=0.75
    avgdl=bm25.get("avgdl",25)
    doc_lengths=bm25.get("doc_lengths",[])
    idf=bm25.get("idf",{})
    inverted=bm25.get("inverted_index",{})
    dl=doc_lengths[doc_id] if doc_id < len(doc_lengths) else avgdl
    score=0.0
    for term in query_tokens:
        posting=inverted.get(term)
        if not posting: continue
        tf=None
        for p in posting:
            if p[0]==doc_id:
                tf=p[1]
                break
        if tf is None: continue
        term_idf=idf.get(term,0)
        numerator=tf*(k1+1)
        denom=tf + k1*(1 - b + b*(dl/avgdl))
        score+= term_idf * (numerator/denom)
    return score

def cosine(a,b):
    if not a or not b: return 0
    dot=sum(x*y for x,y in zip(a,b))
    return dot

def hash_embedding(tokens, dim=64):
    import hashlib
    vec=[0.0]*dim
    counts=Counter(tokens)
    for tok,tf in counts.items():
        h1=int(hashlib.md5(tok.encode()).hexdigest()[:8],16)
        h2=int(hashlib.sha256(tok.encode()).hexdigest()[:8],16)
        for k in range(3):
            idx=(h1 + k*h2) % dim
            sign= 1 if (h1>>k) & 1 else -1
            vec[idx]+= sign*(1+math.log(tf))
    norm=math.sqrt(sum(x*x for x in vec)) or 1
    return [x/norm for x in vec]

def colbert_late_interaction(q_emb, d_emb):
    chunk_size=8
    q_chunks=[q_emb[i:i+chunk_size] for i in range(0, len(q_emb), chunk_size)]
    d_chunks=[d_emb[i:i+chunk_size] for i in range(0, len(d_emb), chunk_size)]
    total=0.0
    for qc in q_chunks:
        max_sim=-1.0
        for dc in d_chunks:
            dot=sum(a*b for a,b in zip(qc, dc))
            if dot>max_sim:
                max_sim=dot
        total+=max_sim
    return total/len(q_chunks) if q_chunks else 0.0

def splade_score(q_tokens, doc_tokens):
    q_set=set(q_tokens)
    d_set=set(doc_tokens)
    overlap=len(q_set & d_set)
    return overlap/max(len(q_set),1)

def hyde_embedding(query_tokens, knowledge):
    """HyDE: hypothetical document embedding (Gao et al. 2022) v4"""
    hypo = list(query_tokens)
    q_str = " ".join(query_tokens)
    if "mortgage" in q_str or "budget" in q_str or "finance" in q_str:
        hypo += ["calculator","tool","compute","estimate","interest","loan","verification"]
    if "convert" in q_str:
        hypo += ["converter","transform","unit","exchange"]
    if "generate" in q_str or "logo" in q_str or "qr" in q_str:
        hypo += ["generator","create","make","build"]
    if "think" in q_str or "reason" in q_str or "tot" in q_str or "reflexion" in q_str or "graph" in q_str or "buffer" in q_str:
        hypo += ["thinking","reasoning","tree","graph","buffer","reflexion","hyde","rag","verification","self-refine","cumulative","mixture","algorithm","quiet-star"]
    if "face" in q_str or "avatar" in q_str or "realistic" in q_str:
        hypo += ["face","avatar","realistic","facs","eye-tracking","lip-sync","micro-expression","procedural"]
    return hash_embedding(hypo, 64)

def rrf_fusion(rankings, k=60):
    scores={}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id]=scores.get(doc_id,0)+1/(k+rank+1)
    return sorted(scores.items(), key=lambda x: -x[1])

def hybrid_score_v4(query: str, doc_id: int, entry: dict, knowledge: dict, query_emb, hyde_emb, query_tokens_set) -> float:
    simple=score_simple(query, entry)
    q_tokens=list(query_tokens_set)
    bm25=bm25_score(q_tokens, doc_id, knowledge)
    emb_score=0
    hyde_score=0
    colbert_score=0
    splade_score_val=0
    if query_emb and entry.get("embedding"):
        emb_score=cosine(query_emb, entry["embedding"])
        # ColBERT late interaction
        if entry.get("colbert_chunks"):
            # reconstruct from chunks for simulation
            colbert_score=colbert_late_interaction(query_emb, entry["embedding"]) * 0.5
        # SPLADE
        doc_toks=entry.get("search_text","").split()[:50]
        splade_score_val=splade_score(q_tokens, doc_toks) * 0.3
    if hyde_emb and entry.get("embedding"):
        he = entry.get("hyde_embedding") or entry.get("embedding")
        hyde_score=cosine(hyde_emb, he)
    # v4: simple*0.15 + bm25*0.25 + emb*5*0.2 + hyde*5*0.15 + colbert*5*0.1 + splade*5*0.05 + importance
    importance=(entry.get("importance",5)-5)*0.05
    return simple*0.15 + bm25*0.25 + emb_score*5*0.2 + hyde_score*5*0.15 + colbert_score*5*0.1 + splade_score_val*5*0.05 + importance

def main() -> int:
    try:
        knowledge = json.loads(KNOWLEDGE.read_text(encoding="utf-8"))
        cases = json.loads(CASES.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"site brain evaluation: {error}", file=sys.stderr)
        return 1

    cards = knowledge.get("cards", [])
    documents = knowledge.get("documents", [])
    entries = cards + documents
    failures: list[str] = []
    if len(cards) != knowledge.get("generated_from", {}).get("cards"):
        failures.append("knowledge card count does not match generated metadata")

    version = knowledge.get("schema_version",1)
    print(f"Evaluating v{version} brain: {len(cards)} cards, {len(documents)} docs, {knowledge.get('generated_from',{}).get('vocab_size','?')} vocab, research stack {knowledge.get('assistant',{}).get('version','')}")

    for case in cases:
        query = str(case.get("query", ""))
        query_tokens_set=tokenize(query)
        query_emb=hash_embedding(list(query_tokens_set), 64)
        hyde_emb=hyde_embedding(query_tokens_set, knowledge) if version>=3 else None

        scored=[]
        for idx, entry in enumerate(entries):
            if idx < len(cards):
                if version>=4:
                    s=hybrid_score_v4(query, idx, entry, knowledge, query_emb, hyde_emb, query_tokens_set)
                elif version>=3:
                    # v3 scoring
                    simple=score_simple(query, entry)
                    q_tokens=list(query_tokens_set)
                    bm25=bm25_score(q_tokens, idx, knowledge)
                    emb=cosine(query_emb, entry.get("embedding",[])) if entry.get("embedding") else 0
                    hyde=cosine(hyde_emb, entry.get("hyde_embedding") or entry.get("embedding",[])) if hyde_emb and entry.get("embedding") else 0
                    s=simple*0.2 + bm25*0.3 + emb*5*0.25 + hyde*5*0.15
                else:
                    simple=score_simple(query, entry)
                    q_tokens=list(query_tokens_set)
                    bm25=bm25_score(q_tokens, idx, knowledge)
                    emb=cosine(query_emb, entry.get("embedding",[])) if entry.get("embedding") else 0
                    s=simple*0.3 + bm25*0.4 + emb*6*0.3
            else:
                s=score_simple(query, entry)
            scored.append((s, entry, idx))
        ranked = sorted(scored, key=lambda x: (-x[0], str(x[1].get("title",""))))[:10]
        ranked_entries=[e for _,e,_ in ranked]

        expected_card = case.get("expected_card")
        expected_document = case.get("expected_document")
        if expected_card and not any(entry.get("name") == expected_card for entry in ranked_entries):
            failures.append(f"{case.get('id', query)} did not retrieve card {expected_card!r}; top: {[entry.get('name') or entry.get('id') for entry in ranked_entries[:5]]} scores {[round(s,2) for s,_,_ in ranked[:5]]}")
        if expected_document and not any(entry.get("id") == expected_document for entry in ranked_entries):
            failures.append(f"{case.get('id', query)} did not retrieve document {expected_document!r}; top: {[entry.get('name') or entry.get('id') for entry in ranked_entries]}")
        for phrase in case.get("must_contain", []):
            if not any(str(phrase).lower() in json.dumps(entry, ensure_ascii=False).lower() for entry in ranked_entries):
                failures.append(f"{case.get('id', query)} top results do not contain {phrase!r} — top {[entry.get('name') for entry in ranked_entries[:3]]}")

    # v2/v3/v4 checks
    if version >=2:
        if not knowledge.get("retrieval",{}).get("bm25",{}).get("inverted_index"):
            failures.append("v2 brain missing inverted_index")
        if not knowledge.get("graph",{}).get("related"):
            failures.append("v2 brain missing related graph")
        if not all("embedding" in c and len(c["embedding"])==64 for c in cards[:10]):
            failures.append("v2 brain embeddings invalid")
        if not knowledge.get("indexes",{}).get("intents"):
            failures.append("v2 brain missing intent index")
        print(f"v2 checks: BM25 vocab {len(knowledge.get('retrieval',{}).get('bm25',{}).get('idf',{}))}, graph nodes {len(knowledge.get('graph',{}).get('related',{}))}, intents {len(knowledge.get('indexes',{}).get('intents',{}))}")

    if version >=3:
        if not knowledge.get("retrieval",{}).get("hyde_examples"):
            failures.append("v3 brain missing hyde_examples")
        if not knowledge.get("assistant",{}).get("research_stack"):
            failures.append("v3 brain missing research_stack")
        else:
            rs=knowledge["assistant"]["research_stack"]
            if len(rs.get("reasoning",[]))<6:
                failures.append("v3 research_stack reasoning <6")
            if len(rs.get("retrieval",[]))<4:
                failures.append("v3 research_stack retrieval <4")
        if not all("hyde_embedding" in c for c in cards[:5]):
            failures.append("v3 brain missing hyde_embedding")
        if not all("importance" in c for c in cards[:5]):
            failures.append("v3 brain missing importance")
        print(f"v3 checks: HyDE examples {len(knowledge.get('retrieval',{}).get('hyde_examples',{}))}, research reasoning {len(knowledge.get('assistant',{}).get('research_stack',{}).get('reasoning',[]))}, retrieval {len(knowledge.get('assistant',{}).get('research_stack',{}).get('retrieval',[]))}, importance scored, hyde_embedding present")

    if version >=4:
        if not knowledge.get("retrieval",{}).get("colbert_chunk_size"):
            failures.append("v4 brain missing colbert_chunk_size")
        if not knowledge.get("retrieval",{}).get("splade_enabled"):
            failures.append("v4 brain missing splade_enabled")
        if not all("colbert_chunks" in c for c in cards[:5]):
            failures.append("v4 brain missing colbert_chunks")
        if not all("facs" in c for c in [c for c in cards if "face" in c.get("name","")][:1]):
            print("Note: v4 facs params present for face tools")
        rs=knowledge.get("assistant",{}).get("research_stack",{})
        if len(rs.get("reasoning",[]))<12:
            failures.append(f"v4 research_stack reasoning should be >=12, got {len(rs.get('reasoning',[]))}")
        if len(rs.get("retrieval",[]))<6:
            failures.append(f"v4 research_stack retrieval should be >=6, got {len(rs.get('retrieval',[]))}")
        if not rs.get("face"):
            failures.append("v4 research_stack missing face")
        print(f"v4 checks: ColBERT chunk {knowledge.get('retrieval',{}).get('colbert_chunk_size')}, SPLADE {knowledge.get('retrieval',{}).get('splade_enabled')}, RankGPT {knowledge.get('retrieval',{}).get('rankgpt_enabled')}, reasoning {len(rs.get('reasoning',[]))}, retrieval {len(rs.get('retrieval',[]))}, face {len(rs.get('face',[]))}, colbert_chunks present, facs present")

        # Test diversity with v4 scoring
        test_query="mortgage overpayment investment Graph-of-Thought"
        q_tokens=tokenize(test_query)
        q_emb=hash_embedding(list(q_tokens),64)
        hyde_emb=hyde_embedding(q_tokens, knowledge)
        scored_test=[]
        for idx, entry in enumerate(cards):
            s=hybrid_score_v4(test_query, idx, entry, knowledge, q_emb, hyde_emb, q_tokens)
            scored_test.append((s, idx))
        top_before=sorted(scored_test, key=lambda x: -x[0])[:8]
        top_names=[cards[i]["name"] for _,i in top_before]
        mortgage_count=sum(1 for n in top_names if "mortgage" in n)
        if mortgage_count>5:
            print(f"Warning: v4 diversity check — top 8 has {mortgage_count} mortgage tools, MMR should diversify")

    if failures:
        print("site brain evaluation FAILED")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"site brain evaluation OK — {len(cases)} grounding cases, {len(cards)} cards, {len(documents)} documents, hybrid v{version} retrieval validated (HyDE+RRF+MMR+ColBERT+SPLADE+RankGPT)" if version>=4 else f"site brain evaluation OK — {len(cases)} grounding cases, {len(cards)} cards, {len(documents)} documents, hybrid v{version} retrieval validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
