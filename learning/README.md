# Byte learning ledger

Byte can learn in two deliberately separate ways:

1. **Private memory** stays in the visitor's browser `localStorage` and can be
   deleted there at any time.
2. **Shared site learning** is reviewed here before it becomes public context.
   A visitor can export a learning bundle from `local-ai.html`; a maintainer
   may copy only verified, useful entries into `approved.json` and regenerate
   the index with:

   ```bash
   python3 scripts/build-site-brain.py
   ```

The live page cannot write to this directory, commit code, or silently train a
model. That boundary is intentional: a useful correction should be reviewable,
reproducible, and attributable before it changes what the site tells people.

Each approved entry needs this shape for retrieval:

```json
{
  "id": "short-stable-id",
  "content": "A verified fact or answer pattern Byte may use.",
  "source": "URL, issue, or human review note",
  "tags": ["optional", "terms"]
}
```

For a reviewed example to enter a future local fine-tuning dataset, add
`question` and `answer` fields as well. Export the dataset without any network
call with:

```bash
python3 scripts/prepare-byte-dataset.py --output /tmp/byte-sft.jsonl
```

That JSONL is deliberately not committed as a model or trained weight. A
maintainer can use it with an approved local SFT toolchain, evaluate the result
against `learning/evaluation.json`, then update the browser model only through
an explicit reviewed release.
