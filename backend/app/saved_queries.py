import os
import glob
import json
import shutil
import datetime

SAVED_QUERIES_DIR = "saved_queries"

def get_connection_dir(connection: dict = None):
    """
    Returns the directory path for a specific connection.
    If connection is None, returns global SAVED_QUERIES_DIR.
    Structure: saved_queries/<host>_<port>/<database>/
    """
    if not connection:
        return SAVED_QUERIES_DIR
    
    host = connection.get("host", "localhost")
    port = connection.get("port", 5432)
    db = connection.get("database", "postgres")
    
    # Sanitize
    host = host.replace(":", "_").replace("/", "_")
    db = db.replace(":", "_").replace("/", "_")
    
    path = os.path.join(SAVED_QUERIES_DIR, f"{host}_{port}", db)
    return path

def list_saved_queries(connection: dict = None):
    try:
        base_dir = get_connection_dir(connection)
        print(f"DEBUG: Listing saved queries from {base_dir}...")
        
        if not os.path.exists(base_dir):
            print("DEBUG: Directory not found")
            return []
        
        # Load from session_history.json
        history_path = os.path.join(base_dir, "session_history.json")
        session_titles = []
        if os.path.exists(history_path):
             try:
                with open(history_path, "r") as f:
                    data = json.load(f)
                    # specific sort by time desc if available
                    sessions = data.get("sessions", [])
                    # sort by time descending
                    sessions.sort(key=lambda s: s.get("time", ""), reverse=True)
                    session_titles = [s.get("title") for s in sessions if s.get("title")]
             except Exception as e:
                 print(f"Error parsing session_history.json: {e}")
        
        print(f"DEBUG: Returning titles: {session_titles}")
        return session_titles
    except Exception as e:
        print(f"Error listing saved queries: {e}")
        return []

def list_parameterized_queries(connection: dict = None):
    """Lists queries from queries.json for a specific connection"""
    try:
        base_dir = get_connection_dir(connection)
        filepath = os.path.join(base_dir, "queries.json")
        
        if os.path.exists(filepath):
             with open(filepath, "r") as f:
                 data = json.load(f)
                 return data.get("queries", [])
        return []
    except Exception as e:
        print(f"Error listing parameterized queries: {e}")
        return []

def get_saved_query(name: str, connection: dict = None):
    """Returns dict { sql, history, title } from session_history.json"""
    try:
        base_dir = get_connection_dir(connection)
        print(f"DEBUG: Getting query {name} from {base_dir}")
        
        # Check session_history.json
        history_path = os.path.join(base_dir, "session_history.json")
        if os.path.exists(history_path):
             try:
                with open(history_path, "r") as f:
                    data = json.load(f)
                    for s in data.get("sessions", []):
                        if s.get("title") == name:
                            frontend_history = []
                            last_sql = ""
                            
                            for q in s.get("queries", []):
                                if q.get("prompt"):
                                    frontend_history.append({"role": "user", "content": q.get("prompt"), "status": "success"})
                                if q.get("sql"):
                                    last_sql = q.get("sql")
                                    frontend_history.append({"role": "assistant", "content": f"```sql\n{last_sql}\n```", "status": "success"})
                            
                            return {
                                "sql": last_sql, 
                                "history": frontend_history,
                                "title": s.get("title")
                            }
             except Exception as e:
                 print(f"Error reading details: {e}")

        return None
    except Exception as e:
        print(f"Error reading query: {e}")
        raise e

def append_session_history(title: str, prompt: str, response: str, connection: dict = None):
    """
    Appends a prompt/response pair to the session_history.json file.
    """
    try:
        base_dir = get_connection_dir(connection)
        print(f"DEBUG: Appending to session {title} in {base_dir}")
        
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)
            
        filepath = os.path.join(base_dir, "session_history.json")
        
        # Load existing history
        data = {"sessions": []}
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    content = f.read().strip()
                    if content:
                        data = json.loads(content)
            except json.JSONDecodeError:
                pass 

        # Find existing session by title
        session = None
        for s in data["sessions"]:
            if s.get("title") == title:
                session = s
                break
        
        # Create new session if not found
        if not session:
            session = {
                "time": datetime.datetime.now().isoformat(),
                "title": title,
                "queries": []
            }
            data["sessions"].append(session)
        
        if "queries" not in session:
            session["queries"] = []

        # Extract SQL from response if possible
        import re
        sql_match = re.search(r"```sql\s*(.*?)\s*```", response, re.DOTALL)
        sql_code = sql_match.group(1).strip() if sql_match else response
        sql_code = re.sub(r"(^|\n)Title:.*?(\r\n|\n|$)", "", sql_code).strip()
        
        # Append as a query pair
        session["queries"].append({
            "prompt": prompt,
            "sql": sql_code
        })
        
        # Save back
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
        return True
    except Exception as e:
        print(f"Error appending session history: {e}")
        return False

def save_full_session_to_history(title: str, sql: str, history: list, connection: dict = None):
    try:
        base_dir = get_connection_dir(connection)
        print(f"DEBUG: Saving session {title} to {base_dir}")
        
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)
            
        filepath = os.path.join(base_dir, "session_history.json")
        
        data = {"sessions": []}
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    content = f.read().strip()
                    if content:
                        data = json.loads(content)
            except json.JSONDecodeError as e:
                pass 
        
        # Transform frontend history
        simplified_queries = []
        current_pair = {}
        
        for msg in history:
            role = msg.get("role")
            content = msg.get("content", "")
            
            if role == "user":
                if "prompt" in current_pair: 
                    simplified_queries.append(current_pair)
                    current_pair = {}
                current_pair["prompt"] = content
            elif role == "assistant":
                import re
                sql_match = re.search(r"```sql\s*(.*?)\s*```", content, re.DOTALL)
                sql_code = sql_match.group(1).strip() if sql_match else content
                sql_code = re.sub(r"(^|\n)Title:.*?(\r\n|\n|$)", "", sql_code).strip()
                
                current_pair["sql"] = sql_code
                if "prompt" not in current_pair:
                    current_pair["prompt"] = "Query"
                simplified_queries.append(current_pair)
                current_pair = {}
                
        if "prompt" in current_pair:
             simplified_queries.append(current_pair)

        existing_idx = -1
        for i, s in enumerate(data.get("sessions", [])):
            if s.get("title") == title:
                existing_idx = i
                break
        
        new_session_obj = {
            "time": datetime.datetime.now().isoformat(),
            "title": title,
            "queries": simplified_queries
        }
        
        if existing_idx >= 0:
            data["sessions"][existing_idx] = new_session_obj
        else:
            data["sessions"].append(new_session_obj)
            
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
        return True

    except Exception as e:
        print(f"Error saving full session: {e}")
        return False

def save_parameterized_query(name: str, sql: str, params: list, original_sql: str, connection: dict = None):
    """
    Saves a parameterized query to queries.json
    """
    try:
        base_dir = get_connection_dir(connection)
        print(f"DEBUG: Saving parameterized query {name} to {base_dir}")
        
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)
            
        filepath = os.path.join(base_dir, "queries.json")
        
        data = {"queries": []}
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    content = f.read().strip()
                    if content:
                        data = json.loads(content)
            except json.JSONDecodeError:
                pass
                
        # Append new query
        new_query = {
            "id": datetime.datetime.now().strftime("%Y%m%d%H%M%S"),
            "name": name,
            "sql": sql,
            "params": params,
            "original_sql": original_sql,
            "created_at": datetime.datetime.now().isoformat()
        }
        
        data["queries"].append(new_query)
        
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
        return new_query
    except Exception as e:
        print(f"Error saving parameterized query: {e}")
        raise e

def delete_all_saved_queries(connection: dict = None):
    try:
        base_dir = get_connection_dir(connection)
        if os.path.exists(base_dir):
            shutil.rmtree(base_dir)
            os.makedirs(base_dir)
        return True
    except Exception as e:
        print(f"Error deleting saved queries: {e}")
        return False

def delete_saved_query(query_id: str, connection: dict = None):
    """
    Deletes a specific parameterized query by ID.
    """
    try:
        base_dir = get_connection_dir(connection)
        print(f"DEBUG: Deleting query {query_id} from {base_dir}")
        filepath = os.path.join(base_dir, "queries.json")
        
        if not os.path.exists(filepath):
            return False
            
        with open(filepath, "r") as f:
            data = json.load(f)
            
        initial_count = len(data.get("queries", []))
        data["queries"] = [q for q in data.get("queries", []) if q.get("id") != query_id]
        
        if len(data["queries"]) == initial_count:
            return False # Not found
            
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
        return True
    except Exception as e:
        print(f"Error deleting query: {e}")
        return False
