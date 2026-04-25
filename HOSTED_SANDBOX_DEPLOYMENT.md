# Hosted Sandbox Deployment

Geometra keeps framework code, examples, and public deployment guidance in this repository. Live production or sandbox operations should live in a separate private deployment repo.

Recommended split:

- Public `geometra`: reusable gateway APIs, demos, OpenAPI, replay examples, and deploy guidance.
- Private deploy repo: domain names, VPS paths, process manager files, environment variables, API keys, and CI deploy workflow.

For the claims/compliance sandbox, the intended public endpoints are:

- `GET /inspect`
- `GET /actions`
- `POST /actions/request`
- `POST /actions/approve`
- `GET /trace`
- `GET /replay`

The deploy app should depend on published packages instead of importing local source:

```json
{
  "dependencies": {
    "@geometra/core": "^1.61.1",
    "@geometra/gateway": "^1.61.1"
  }
}
```

For a VPS deployment, run the gateway behind a reverse proxy such as Caddy or nginx, bind the Node process to `127.0.0.1`, and expose only HTTPS publicly.

Suggested domains:

- `geometra.razroo.com` for the public product/demo surface.
- `sandbox.geometra.razroo.com` for a live gateway sandbox.
- `api.geometra.razroo.com` later if a production API surface is needed.

Do not commit `.env`, deploy keys, real API keys, or VPS-only service config to this public repository.
