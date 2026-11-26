# Aurelle Secure Demo

A small three-service storefront used to demo Datadog Code Security, Code Quality and PR Gates on GitHub.

| Service | Language | Path | Port |
|---|---|---|---|
| storefront (API + web page) | Node.js / Express | `services/storefront` | 8080 |
| inventory | Python / Flask | `services/inventory` | 8091 |
| payments | Java / Jetty | `services/payments` | 8092 |

All three use one PostgreSQL database.

## Run locally

```bash
PGPASSWORD=<choose-a-password> docker compose up --build
```

Open http://localhost:8080.

## Branching

`main` is kept clean. Changes arrive through pull requests; the Datadog PR Gate checks must pass before merge.

## API notes

- `GET /api/version` on the storefront returns `{service, version, commit}`; `commit` comes from the `GIT_COMMIT` env var (or `unknown`).
