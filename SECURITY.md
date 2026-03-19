# Security Notes

## Known vulnerabilities (as of 2026-03-19)

5 moderate severity in LangChain dependencies — all in unused code paths.

| Package | Issue | Used? |
|---|---|---|
| `@langchain/community` | SSRF via `RecursiveUrlLoader` | No — we use Chroma + Ollama only |
| `langsmith` | SSRF via tracing header injection | No — tracing not enabled |
| `@langchain/core` | Depends on vulnerable langsmith | Indirect only |

## Why we're not force-upgrading

`npm audit fix --force` would install `@langchain/community@1.1.24` — a breaking
change that would break the LLMChain/PromptTemplate API used throughout the pipeline.

## Revisit when

- We add `RecursiveUrlLoader` or any web-scraping feature
- We enable LangSmith tracing
- LangChain 1.x stabilizes and migration is worth the effort
