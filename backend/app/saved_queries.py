import os
import glob

SAVED_QUERIES_DIR = "saved_queries"

def list_saved_queries():
    try:
        if not os.path.exists(SAVED_QUERIES_DIR):
            return []
        files = glob.glob(os.path.join(SAVED_QUERIES_DIR, "*.sql"))
        # Return list of filenames without extension, sorted by modification time
        files.sort(key=os.path.getmtime, reverse=True)
        return [os.path.splitext(os.path.basename(f))[0] for f in files]
    except Exception as e:
        print(f"Error listing saved queries: {e}")
        return []

def save_query(name: str, sql_content: str):
    try:
        if not os.path.exists(SAVED_QUERIES_DIR):
            os.makedirs(SAVED_QUERIES_DIR)
        
        # Sanitize name lightly
        safe_name = "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).strip()
        if not safe_name:
            raise ValueError("Invalid query name")
            
        filepath = os.path.join(SAVED_QUERIES_DIR, f"{safe_name}.sql")
        with open(filepath, "w") as f:
            f.write(sql_content)
        return safe_name
    except Exception as e:
        print(f"Error saving query: {e}")
        raise e

def get_saved_query(name: str):
    try:
        filepath = os.path.join(SAVED_QUERIES_DIR, f"{name}.sql")
        if not os.path.exists(filepath):
            return None
        with open(filepath, "r") as f:
            return f.read()
    except Exception as e:
        print(f"Error reading query: {e}")
        raise e
