import requests
import json

API_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5-coder:14b"

CURRENT_SQL = """
SELECT 
    m.title,
    m.release_date,
    g.name as genre
FROM movies m
JOIN movie_genres mg ON m.id = mg.movie_id
JOIN genres g ON mg.genre_id = g.id
WHERE m.release_date > '2000-01-01'
ORDER BY m.revenue DESC
LIMIT 10;
"""

USER_REQUEST = "Also filter by genre 'Action' and select the movie id as well."

PROMPT = f"""
You are a coding assistant. Do NOT generate the full code.
Instead, generate specific SEARCH and REPLACE blocks to modify the existing code.

Format:
<<<<
[Exact code snippet to remove from original]
====
[New code snippet to insert]
>>>>

Rules:
1. The SEARCH block must match the whitespace in the original code EXACTLY.
2. Include enough context in SEARCH to be unique.
3. You can output multiple blocks.

Existing SQL:
```sql
{CURRENT_SQL}
```

Request: {USER_REQUEST}
"""

def run_experiment():
    payload = {
        "model": MODEL,
        "prompt": PROMPT,
        "stream": False,
        "options": {"temperature": 0.1}
    }
    
    print(f"Testing Diff Generation with {MODEL}...")
    try:
        res = requests.post(API_URL, json=payload)
        res.raise_for_status()
        response = res.json()['response']
        print("\n--- MODEL OUTPUT ---")
        print(response)
        print("--------------------\n")
        
        # Simple Validation Logic
        if "====" in response and "FILTER BY" not in response: # Heuristic check
             print("✅ Output format looks promising.")
        else:
             print("⚠️ Output might be irregular.")
             
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_experiment()
