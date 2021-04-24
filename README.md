# cf-dns-update-worker

This project is a Cloudflare worker that enables to update dynamically A and AAAA records with the Cloudflare DNS service.

## Installation & Deployment

To deploy a new installation on your Cloudflare instance, you can use `wrangler`.

First login to your Cloudflare account:

```bash
wrangler login
```

Copy the `wrangler.yaml.example` to `wrangler.yaml` and fill the values. You will need to create new Workers KV Namespace in the Cloudflare dashboard.

Create a Cloudflare token within the dashboard with the needed DNS permissions and set the secrets with wrangler:

```bash
wrangler secret put CF_DNS_TOKEN --env production
wrangler secret put CF_ZONE_ID --env production
```

Next, deploy the worker:

```bash
wrangler publish --env production
```

You will then need to generate a salt to generate API keys and their respective token IDs.

```bash
curl -s 'https://your.domain.to.your.worker/salt'
```

Take the `salt` value and push it to the secrets with `wrangler`:

```bash
wrangler secret put TOKEN_SALT --env production
```

Then create a admin token with the `token_id` value by replacing `<token_id>` with its value:

```bash
wrangler kv:key put -binding KV --env production token:<token_id> '{"type": "ADMIN"}'
```

You can then use the `apikey` value to connect to the API. To check its validity run:

```bash
curl -s 'https://your.domain.to.your.worker/tokens/me' \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer '$MY_API_KEY
```


