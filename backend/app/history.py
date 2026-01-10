import sqlite3
import os
from pydantic import BaseModel
from typing import List

# Persist history across container restarts by default.
# Can be overridden via env var.
DB_PATH = os.getenv("PGRAY_HISTORY_DB", "/data/history.db")

class HistoryItem(BaseModel):
    id: int
    query: str
    timestamp: str

def get_db_connection():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS query_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def add_history_item(query: str):
    conn = get_db_connection()
    c = conn.cursor()
    # Check if the query is the same as the most recent one to avoid duplicates
    c.execute('SELECT query FROM query_history ORDER BY id DESC LIMIT 1')
    last_query = c.fetchone()
    
    if last_query and last_query['query'].strip() == query.strip():
        conn.close()
        return

    c.execute('INSERT INTO query_history (query) VALUES (?)', (query,))
    conn.commit()
    conn.close()

def get_history_items(limit: int = 50) -> List[dict]:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT id, query, timestamp FROM query_history ORDER BY id DESC LIMIT ?', (limit,))
    rows = c.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]
