# ai-book-factory

AI-powered book generation pipeline. Node handles the API and orchestration. Python handles EPUB export.

## Stack

- Node.js + Express — API + pipeline
- LangChain — pipeline glue (chains, prompts)
- Ollama — local LLM
- Chroma — vector memory
- Python + ebooklib — EPUB export

## Setup

### Node
```bash
npm install
cp .env .env.local
npm run dev
```

### Python (epub export)
```bash
pip install -r python/requirements.txt
```

### Services to run locally
```bash
ollama serve
chroma run --path ./data/chroma
```

## Modes

- `abridged` — chunk + summarize source text
- `story` — style/tone-controlled prose generation
- `adventure` — branching narrative paths

## Pipeline flow

```
input → planner → writer → editor → output
                              ↕
                           Chroma (memory)
```

## Scripts

```bash
node scripts/ingestBook.js <path> <title>
node scripts/testPipeline.js
node scripts/exportBook.js <book_id> [epub|kindle|html]
```
