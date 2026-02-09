
import os
import json
import time
from typing import List, Optional, Dict

def _get_history_file(connection: dict) -> str:
    # Logic to map connection to file path
    # Same as saved_queries: saved_queries/{host}_{port}/{db}/ask_history.json
    base_path = os.path.join(os.path.dirname(__file__), "..", "saved_queries")
    host = connection.get("host", "unknown")
    port = connection.get("port", 5432)
    db = connection.get("database", "postgres")
    
    # Docker host.docker.internal mapping... generic safe string
    host_safe = str(host).replace(":", "_")
    
    dir_path = os.path.join(base_path, f"{host_safe}_{port}", db)
    os.makedirs(dir_path, exist_ok=True)
    return os.path.join(dir_path, "ask_history.json")

def get_recent_asks(connection: dict, limit: int = 5) -> List[str]:
    if not connection: return []
    filepath = _get_history_file(connection)
    if not os.path.exists(filepath):
        return []
        
    try:
        with open(filepath, "r") as f:
            history = json.load(f)
            # history is list of dicts: { prompt, sql, timestamp }
            # We want unique prompts, most recent first.
            prompts = []
            seen = set()
            for item in reversed(history):
                p = item.get("prompt")
                if p and p.strip() and p not in seen:
                    prompts.append(p)
                    seen.add(p)
                if len(prompts) >= limit:
                    break
            return prompts
    except Exception as e:
        print(f"Error reading ask history: {e}")
        return []

def save_ask_success(connection: dict, prompt: str, sql: str):
    if not connection: return
    filepath = _get_history_file(connection)
    history = []
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                history = json.load(f)
        except:
            pass

    # Normalize prompt? Trim space.
    prompt = prompt.strip()
    if not prompt: return

    entry = {
        "prompt": prompt,
        "sql": sql,
        "timestamp": time.time()
    }
    history.append(entry)
    
    # Limit history size? 100?
    if len(history) > 200:
        history = history[-200:]
        
    with open(filepath, "w") as f:
        json.dump(history, f, indent=2)

def find_cached_sql(connection: dict, prompt: str) -> Optional[str]:
    if not connection: return None
    filepath = _get_history_file(connection)
    if not os.path.exists(filepath):
        return None
        
    try:
        with open(filepath, "r") as f:
            history = json.load(f)
            
        # Search backwards for latest match in this connection context
        target = prompt.strip()
        for item in reversed(history):
            if item.get("prompt", "").strip() == target:
                return item.get("sql")
    except Exception as e:
        pass
    return None
