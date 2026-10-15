# Travel Anchor

P0 browser prototype for an **AI-native future travel network**.

The core product hypothesis is that a confirmed traveller can become an **Anchor** for people whose destination is known but whose dates are still flexible.

## What works in this prototype

- Anonymous-first personas; no real account system required
- Multiple test personas in one browser
- Traveller profile + natural-language profile analysis prototype
- `Interested / Flexible / Confirmed` trips
- Destination timeline / density
- Date + activity + travel-style matching
- Compatibility score + confidence kept separate
- Explainable match reasons and potential friction
- Request / accept connection flow
- Local social-proof field
- Browser-local persistence with `localStorage`

## Data architecture

The current version intentionally has **no shared database**. All demo users, trips and connections live in `localStorage` in one browser.

This is useful for product testing because one person can simulate Alice / Bob / Charles / Claire without creating accounts.

A real multi-user network will need a backend. The intended next step is likely:

- Supabase / PostgreSQL for shared users, trips and connections
- Anonymous auth first, then email magic-link account claim
- Row-level security for profile/trip visibility
- Server-side AI adapter for profile extraction, semantic reranking and match explanations

GitHub Pages can host the static frontend, but it **cannot safely hold an OpenAI API secret or act as the database/backend**.

## AI architecture

P0 currently uses a deterministic local semantic prototype so the whole product is testable on GitHub Pages without exposing an API key.

Production flow should be:

1. Hard filters: destination, dates, privacy, blocks, explicit constraints
2. Structured compatibility score
3. Send only top candidates to a low-cost LLM
4. LLM semantic rerank + explanation
5. Store structured traveller vector so the full interview does not need to be reprocessed for every match

## Local use

Open `index.html` directly, or serve the repository with any static server.

## GitHub Pages

`.github/workflows/pages.yml` contains the official Pages deployment workflow. For a new repository, GitHub may require a one-time setting:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

After that, pushes to `main` deploy automatically.
