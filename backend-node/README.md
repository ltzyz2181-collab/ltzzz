# LTZZZ Roundtable (Node)

```bash
cp .env.example .env   # edit keys on server only
npm start
# GET  /health
# POST /round  { "text": "...", "seats": ["gpt","claude","deepseek"] }
# Header optional: X-Lab-Token
```

Never commit `.env`. No payment or wallet features.
