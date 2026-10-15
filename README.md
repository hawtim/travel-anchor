# Travel Anchor

P0.3 prototype for an **AI-native future travel network**.

The core hypothesis is that a confirmed traveller can become an **Anchor** for people who know where they want to go but have flexible dates.

## Current architecture

```text
GitHub Pages
  └─ browser UI
      ├─ local test personas
      ├─ Supabase anonymous auth + shared Postgres network
      └─ Ask Travel Anchor
             ↓
          Render API
             ↓
     GitHub Copilot SDK
             ↓
        GPT-5.6 Luna
```

The app works in two modes:

- **Local demo:** no setup required; multiple personas and trips live in `localStorage`.
- **Shared network:** configure Supabase and the active browser becomes one anonymous network user. Profiles/trips become visible to other signed-in anonymous users according to RLS.

## P0.3 functionality

- Anonymous-first usage
- Multiple local test personas
- Traveller profile and structured travel preferences
- `Interested / Flexible / Confirmed` trips
- Supabase anonymous auth
- Shared profiles and trips
- Row-level security
- Destination timeline / traveller density
- Date + activity + travel-style compatibility
- Compatibility and confidence kept separate
- Connection requests
- Natural-language **Ask Travel Anchor** interface
- Structured facts computed in the app before AI generation
- GPT-5.6 Luna through GitHub Copilot SDK when the Render API is configured
- Deterministic local fallback when AI is unavailable

## 1. Supabase setup

Create a free Supabase project.

Then:

1. Enable **Anonymous Sign-Ins** under Authentication settings.
2. Open the SQL editor.
3. Run [`supabase/schema.sql`](./supabase/schema.sql).
4. Copy these two browser-safe values from the project settings:
   - Project URL
   - Publishable key / anon key

Do **not** expose the `service_role` key.

You can either put the public values in [`runtime-config.js`](./runtime-config.js), or use the **Setup** button in the app to store a browser-local override while testing.

Example:

```js
window.TRAVEL_ANCHOR_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
  apiBaseUrl: "https://travel-anchor-api.onrender.com",
  mode: "auto"
};
```

### Note about test personas

Local personas are deliberately a developer convenience. In shared cloud mode, **one browser session represents one anonymous Supabase user**. Use another browser profile/incognito/device if you want to simulate multiple real cloud users.

## 2. Render AI backend

The repository includes [`render.yaml`](./render.yaml).

Create a Render Blueprint/Web Service from this repository. The service runs from `backend/` and exposes:

- `GET /health`
- `POST /chat`

The backend uses `@github/copilot-sdk` and defaults to `gpt-5.6-luna`.

### Required Render secret

Set:

```text
COPILOT_GITHUB_TOKEN=<your GitHub user token>
```

Do not commit this token and do not place it in `runtime-config.js`.

The Copilot SDK currently supports OAuth user tokens, GitHub App user access tokens, and fine-grained personal access tokens. The GitHub identity behind the token must have access to the selected Copilot model.

Optional environment variables:

```text
COPILOT_MODEL=gpt-5.6-luna
ALLOWED_ORIGINS=https://hawtim.github.io
COPILOT_LOG_LEVEL=warning
```

After Render deploys, copy its public `https://...onrender.com` URL into `runtime-config.js` as `apiBaseUrl`.

## 3. How Ask Travel Anchor works

The LLM is **not** the database or calculator.

For a question such as:

> 日本什么时候人比较多？

The browser first computes structured context such as:

```json
{
  "destinationScope": "Japan",
  "density": [
    {
      "start": "2027-04-15",
      "end": "2027-04-21",
      "confirmed": 12,
      "flexible": 8
    }
  ],
  "topMatches": []
}
```

Only that compact context and the user's question are sent to the Render API. Luna explains the result in natural language.

This keeps model usage cheap and prevents the model from inventing the underlying travel graph.

## 4. Privacy / trust principles

- No real-time GPS
- No exact hotel/room/flight location required
- Social links are user-provided context, not proof of safety
- Compatibility is personal; there is no global human score
- Missing profile data lowers match confidence, not a person's status
- AI must not produce a safety probability for a stranger

## 5. Local development

For the static frontend:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

For the AI backend:

```bash
cd backend
npm install
COPILOT_GITHUB_TOKEN=... npm start
```

The API defaults to port `10000` unless `PORT` is set.

## Deployment

GitHub Pages deployment is handled by the repository's GitHub Actions workflow. Render deployment is independent and can auto-deploy from the same `main` branch.
