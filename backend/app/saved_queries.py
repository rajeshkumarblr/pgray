import os
import glob
import json

SAVED_QUERIES_DIR = "saved_queries"

import datetime

def list_saved_queries():
    try:
        print("DEBUG: Listing saved queries...")
        if not os.path.exists(SAVED_QUERIES_DIR):
            print("DEBUG: Directory not found")
            return []
        
        # Load from session_history.json
        history_path = os.path.join(SAVED_QUERIES_DIR, "session_history.json")
        session_titles = []
        if os.path.exists(history_path):
             try:
                with open(history_path, "r") as f:
                    data = json.load(f)
                    print(f"DEBUG: Loaded data with keys: {data.keys()}")
                    # specific sort by time desc if available
                    sessions = data.get("sessions", [])
                    print(f"DEBUG: Found {len(sessions)} sessions")
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

def get_saved_query(name: str):
    """Returns dict { sql, history, title } from session_history.json"""
    try:
        print(f"DEBUG: Getting query for: {name}")
        # Check session_history.json
        history_path = os.path.join(SAVED_QUERIES_DIR, "session_history.json")
        if os.path.exists(history_path):
             try:
                with open(history_path, "r") as f:
                    data = json.load(f)
                    for s in data.get("sessions", []):
                        if s.get("title") == name:
                            # Map simplified 'queries' back to 'history' for frontend (best effort)
                            # Frontend expects: [{role, content}, ...]
                            # Saved schema: queries: [{prompt, sql}, ...]
                            
                            frontend_history = []
                            last_sql = ""
                            
                            for q in s.get("queries", []):
                                if q.get("prompt"):
                                    frontend_history.append({"role": "user", "content": q.get("prompt"), "status": "success"})
                                if q.get("sql"):
                                    last_sql = q.get("sql")
                                    # Wrap back in markdown for consistency with frontend expectation or raw?
                                    # Frontend handles code blocks. Let's wrap it to be safe or raw string?
                                    # Assistant output usually includes `Title: ...` but we stripped that.
                                    # Let's just return the SQL in a markdown block as the assistant response
                                    frontend_history.append({"role": "assistant", "content": f"```sql\n{last_sql}\n```", "status": "success"})
                            
                            # If we have stored 'history' legacy field, prefer that? 
                            # User wanted simplified schema, so we stick to 'queries'.
                            
                            return {
                                "sql": last_sql, # Return the last query's SQL
                                "history": frontend_history,
                                "title": s.get("title")
                            }
             except Exception as e:
                 print(f"Error reading details: {e}")

        return None
    except Exception as e:
        print(f"Error reading query: {e}")
        raise e



def append_session_history(title: str, prompt: str, response: str):
    """
    Appends a prompt/response pair to the session_history.json file.
    Uses Simplified Schema: queries [{prompt, sql}]
    """
    try:
        print(f"DEBUG: Appending to session: {title}")
        if not os.path.exists(SAVED_QUERIES_DIR):
            os.makedirs(SAVED_QUERIES_DIR)
            
        filepath = os.path.join(SAVED_QUERIES_DIR, "session_history.json")
        
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
            import datetime
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

def save_full_session_to_history(title: str, sql: str, history: list):
    """
    Upserts a full session state into session_history.json using Simplified Schema.
    Schema:
    {
      "sessions": [
        {
          "time": "ISO...",
          "title": "Title",
          "queries": [
             { "prompt": "...", "sql": "..." }
          ]
        }
      ]
    }
    """
    try:
        print(f"DEBUG: Saving session: {title}")
        if not os.path.exists(SAVED_QUERIES_DIR):
            os.makedirs(SAVED_QUERIES_DIR)
            
        filepath = os.path.join(SAVED_QUERIES_DIR, "session_history.json")
        
        data = {"sessions": []}
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    content = f.read().strip()
                    if content:
                        data = json.loads(content)
            except json.JSONDecodeError as e:
                print(f"DEBUG: Corrupt JSON, starting fresh. Error: {e}")
                pass 
        
        # Transform frontend 'history' (list of {role, content}) into simplified 'queries' list
        simplified_queries = []
        current_pair = {}
        
        for msg in history:
            role = msg.get("role")
            content = msg.get("content", "")
            
            if role == "user":
                if "prompt" in current_pair: # Flush previous if no sql
                    simplified_queries.append(current_pair)
                    current_pair = {}
                current_pair["prompt"] = content
            elif role == "assistant":
                # Extract SQL from markdown if present
                import re
                sql_match = re.search(r"```sql\s*(.*?)\s*```", content, re.DOTALL)
                sql_code = sql_match.group(1).strip() if sql_match else content
                # Strip Title line if any (paranoid check)
                sql_code = re.sub(r"(^|\n)Title:.*?(\r\n|\n|$)", "", sql_code).strip()
                
                current_pair["sql"] = sql_code
                if "prompt" not in current_pair:
                    current_pair["prompt"] = "Query" # Fallback if no prompt found?
                simplified_queries.append(current_pair)
                current_pair = {}
                
        # Flush last partial
        if "prompt" in current_pair:
             simplified_queries.append(current_pair)


        # Upsert Logic:
        # If title matches an existing session, UPDATE it.
        # Else APPEND new.
        
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
            print(f"DEBUG: Updating existing session at index {existing_idx}")
            data["sessions"][existing_idx] = new_session_obj
        else:
            print("DEBUG: Appending new session")
            data["sessions"].append(new_session_obj)
            
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
        return True

    except Exception as e:
        print(f"Error saving full session: {e}")
        return False

def save_parameterized_query(name: str, sql: str, params: list, original_sql: str):
    """
    Saves a parameterized query to queries.json
    """
    try:
        print(f"DEBUG: Saving parameterized query: {name}")
        if not os.path.exists(SAVED_QUERIES_DIR):
            os.makedirs(SAVED_QUERIES_DIR)
            
        filepath = os.path.join(SAVED_QUERIES_DIR, "queries.json")
        
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

def delete_all_saved_queries():
    try:
        if os.path.exists(SAVED_QUERIES_DIR):
            import shutil
            shutil.rmtree(SAVED_QUERIES_DIR)
            os.makedirs(SAVED_QUERIES_DIR)
        return True
    except Exception as e:
        print(f"Error deleting saved queries: {e}")
        return False

