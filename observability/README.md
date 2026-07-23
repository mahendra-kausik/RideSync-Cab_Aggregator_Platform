# Observability — Grafana Cloud dashboard

Feeds the live Render `/metrics` endpoint into a Grafana Cloud dashboard. Run on-demand (before a demo or
before taking README screenshots) — see D-014/D-015 in `DECISIONS.md` for why this isn't an always-on job.

## One-time setup

1. Sign up at https://grafana.com (free forever tier: 10k active series, 14-day retention, no credit card).
2. In your new stack: **Connections → Add new connection → Prometheus → Hosted Prometheus metrics.**
   Note the three values shown: **Remote Write Endpoint URL**, **Username / Instance ID**, and generate an
   **API token** (this is the password).
3. `cp observability/.env.example observability/.env` and fill in those three values plus
   `RENDER_METRICS_HOST` (just the hostname, e.g. `ridesync-cab-aggregator-platform.onrender.com`).

## Run the scraper

```bash
docker run -d --name ridesync-alloy \
  --env-file observability/.env \
  -v "$(pwd)/observability/alloy-config.alloy:/etc/alloy/config.alloy" \
  -p 12345:12345 \
  grafana/alloy:latest \
  run --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy
```

Alloy's own UI (scrape status, errors) is at http://localhost:12345. Leave it running for 5-10 minutes to
build up a real time series before checking the dashboard.

Stop it with `docker rm -f ridesync-alloy` when done — nothing is lost; Grafana Cloud keeps whatever was
already pushed for its 14-day retention window.

## Build the dashboard

In Grafana Cloud → **Explore**, pick the Prometheus data source and confirm data is arriving:
`http_request_duration_seconds_bucket`, `ride_match_duration_seconds_bucket`, `circuit_breaker_state`.

Then **Dashboards → New → New dashboard**, add panels:
- **p50/p95/p99 latency:** `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))`
  (swap `0.95` for `0.50`/`0.99`).
- **Request rate:** `sum(rate(http_request_duration_seconds_count[5m])) by (route)`.
- **Error rate:** `sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])) by (route)`.
- **Circuit breaker state:** `circuit_breaker_state` (0=CLOSED, 1=HALF_OPEN, 2=OPEN) as a state-timeline
  or table panel.

Save the dashboard, then **Share → Public dashboard** (or a snapshot) for a link to drop in the README.
