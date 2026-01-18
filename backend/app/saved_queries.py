import os
import glob
import json

SAVED_QUERIES_DIR = "saved_queries"

def list_saved_queries():
    try:
        if not os.path.exists(SAVED_QUERIES_DIR):
            return []
        
        # Get all files
        sql_files = glob.glob(os.path.join(SAVED_QUERIES_DIR, "*.sql"))
        json_files = glob.glob(os.path.join(SAVED_QUERIES_DIR, "*.json"))
        
        # Combine (prefer JSON if both exist? Just list unique names)
        names = set()
        file_map = {} # name -> mtime
        
        for f in sql_files + json_files:
            name = os.path.splitext(os.path.basename(f))[0]
            mtime = os.path.getmtime(f)
            names.add(name)
            # track max mtime for sorting
            if name not in file_map or mtime > file_map[name]:
                file_map[name] = mtime
                
        # Sort by most recent
        sorted_names = sorted(list(names), key=lambda n: file_map[n], reverse=True)
        return sorted_names
    except Exception as e:
        print(f"Error listing saved queries: {e}")
        return []

def save_query(name: str, sql_content: str, history: list = None):
    try:
        if not os.path.exists(SAVED_QUERIES_DIR):
            os.makedirs(SAVED_QUERIES_DIR)
        
        safe_name = "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).strip()
        if not safe_name:
            raise ValueError("Invalid query name")
            
        # Structure
        data = {
            "sql": sql_content,
            "history": history or []
        }
            
        filepath = os.path.join(SAVED_QUERIES_DIR, f"{safe_name}.json")
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
        # If legacy .sql file exists, maybe delete it to avoid confusion? 
        # Or parse logic handles priority. Let's keep it clean.
        legacy_path = os.path.join(SAVED_QUERIES_DIR, f"{safe_name}.sql")
        if os.path.exists(legacy_path):
            os.remove(legacy_path)
            
        return safe_name
    except Exception as e:
        print(f"Error saving query: {e}")
        raise e

def get_saved_query(name: str):
    """Returns dict { sql, history }"""
    try:
        # Try JSON first
        json_path = os.path.join(SAVED_QUERIES_DIR, f"{name}.json")
        if os.path.exists(json_path):
            with open(json_path, "r") as f:
                return json.load(f)
        
        # Try SQL legacy
        sql_path = os.path.join(SAVED_QUERIES_DIR, f"{name}.sql")
        if os.path.exists(sql_path):
            with open(sql_path, "r") as f:
                return {
                    "sql": f.read(),
                    "history": []
                }
                
        return None
    except Exception as e:
        print(f"Error reading query: {e}")
        raise e
