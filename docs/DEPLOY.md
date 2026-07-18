# Deploying Mothtrap

The app is a static SPA. Any host serves it. What differs per deployment is the
**model config** — drop a `mothtrap.config.json` at the web root and the UI adapts.
(The pre-rename `skynets.config.json` is still read as a fallback.) No file
(localhost / dev) → everything is configurable, as normal.

The primary deploy is **https://mothtrap.blue** (live since 2026-07-16): the
lltk.net Hetzner box, set up exactly as described below. **CI deploys it
automatically on every push to `main`** (the `deploy-blue` job: rrsync-jailed
deploy key, held in the repo's Actions secrets); `scripts/deploy.sh` remains for
manual/emergency deploys. The secondary is GitHub Pages at ryanheuser.com/mothtrap/
(cloud-only config, written by the CI workflow).

## `mothtrap.config.json`

| Field | Meaning |
|---|---|
| `provider` | `"ollama"` or `"anthropic"` — the fixed provider |
| `ollamaUrl` | Ollama endpoint, usually a same-origin proxy like `"/ollama"` |
| `model` | The one model users get (they can't change it) |
| `lock` | `true` → hide the provider/model/URL controls entirely |
| `hideOllama` | `true` → hide the Ollama option (a static https deploy that can't reach any local Ollama) |

Loaded once at startup via `fetch("/mothtrap.config.json")` (then the legacy filename). A host that returns
`index.html` for it (some SPA-fallback dev servers) is treated as "no config".

### Examples

**Hosted instance with a co-located, proxied Ollama** (mothtrap.blue) — users just
press Digest, no knobs:

```json
{ "provider": "ollama", "ollamaUrl": "/ollama", "model": "qwen2.5:1.5b", "lock": true }
```

**Cloud-only static deploy** (e.g. GitHub Pages) — https can't reach any local
Ollama, so offer Anthropic (BYO key) / demo only:

```json
{ "provider": "anthropic", "hideOllama": true }
```

## ⚠️ The deployment must not log request bodies

**This is a standing constraint, not advice.** Two user-facing claims depend on
it, and neither lives in this repo:

- `public/privacy.html` tells people the digest's post text is "processed in
  memory to answer that request, and is then gone", and that the model service
  "logs only that a request happened and how long it took".
- The App Store privacy declaration answers **"Data Not Collected"** for it.
  Apple defines *collect* as transmitting data off-device in a way that lets you
  access it for longer than needed to service the request in real time. That
  answer is true only while nothing retains the bodies.

So a server-side config change alone can make both statements false — with no
code change, no failing test, and nothing visible in a diff. Specifically:

- **Do not set `OLLAMA_DEBUG`** (or otherwise raise Ollama's log level): it logs
  prompt contents, which is exactly the post text we promise not to keep.
- **Do not add `$request_body`** to an nginx `log_format`, and do not enable any
  body-capturing module on the `/ollama/` location. The default `combined`
  format is body-free — keep it.
- Anything else that persists request payloads — a debugging proxy, a WAF with
  payload capture, a tracing sidecar — has the same effect.

Verified good as of 2026-07-18: nginx uses the stock `combined` format with no
`$request_body` anywhere, and Ollama runs without `OLLAMA_DEBUG` (1503 request
lines over seven days, none containing `messages`/`content`/`role`). nginx
rotates daily and keeps 14 days of request metadata — time, IP, path; no bodies.

To re-check after touching the box:

```bash
nginx -T | grep -E "log_format|request_body"        # expect no $request_body
systemctl show ollama -p Environment                 # expect no OLLAMA_DEBUG
journalctl -u ollama --since "7 days ago" | grep -cE '"(messages|content|role)"'   # expect 0
```

If any of these change, update `public/privacy.html` and the App Store privacy
answers in the same breath — or revert the change.

## Hosting on a box with Ollama (the mothtrap.blue setup)

Co-locate Ollama with the site and proxy it same-origin, so a deployed https page
can use the local model (no CORS / `OLLAMA_ORIGINS` dance, no client setup):

1. **Ollama** as a cgroup-capped systemd service, bound to `127.0.0.1:11434`,
   `OLLAMA_NUM_PARALLEL=1` (serialize on CPU). Pull one small model. The cap keeps
   us a good neighbour to the other services on the box — a low CPU weight means
   any interactive/latency-sensitive process always preempts inference:

   ```ini
   # /etc/systemd/system/ollama.service.d/override.conf
   [Service]
   CPUWeight=10        # ~nice; other services always win the CPU
   CPUQuota=300%       # hard ceiling: ≤3 of 12 cores, even when the box is idle
   Nice=19
   MemoryMax=4G
   Environment=OLLAMA_HOST=127.0.0.1:11434
   Environment=OLLAMA_NUM_PARALLEL=1
   ```
2. **nginx**: add an isolated `server` block (a new `sites-available/mothtrap`
   vhost — independent of the other sites); serve the built SPA; proxy `/ollama/`
   → `http://127.0.0.1:11434/`, with `limit_req` to rate-limit and an auth gate
   so it isn't an open resource.
3. Drop the `lock` config above (with `"ollamaUrl": "/ollama"`).

**Neighbour budget** (agreed with all three other services on the box — a chess
bot, the prosodic parser, and the lltk corpus viewer / ClickHouse): stay ≤3 cores
at low priority, ≤4 GB RAM, serialized. `CPUQuota=300%` honours the tightest ask
(prosodic's single-threaded parser) and comfortably clears the others — the chess
bot wanted 4 cores free (gets 9), and lltk only asked that we sit below ClickHouse
in scheduling priority (`CPUWeight=10`/`Nice=19` does exactly that) and under
~4–6 GB (`MemoryMax=4G` clears it). All three confirmed port 11434 free and their
nginx vhosts isolated. Give a heads-up before any *sustained/uncapped* run (a huge
backlog re-label, or re-enabling cluster mode) — routine label bursts need none.

Result: a shareable URL where the local-model digest works with zero client setup —
what Tauri would otherwise be for, solved by co-location.
