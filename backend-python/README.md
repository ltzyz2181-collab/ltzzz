# LTZZZ Roundtable (Python / FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env       # edit on server only
uvicorn main:app --host 0.0.0.0 --port 8787
```

No wallet, no custody. Keys only in `.env`.
