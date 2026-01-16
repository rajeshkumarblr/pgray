import logging
import requests
import json
import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OLLAMA_URL = "http://host.docker.internal:11434/api/generate"

def format_schema_ddl(schema: dict) -> str:
    """
    Converts the schema dictionary to SQL DDL (CREATE TABLE) statements.
    """
    if not schema:
        return ""
        
    ddl_statements = []
    
    for table_name, table_data in schema.items():
        columns = table_data if isinstance(table_data, list) else table_data.get("columns", [])
        fks = [] if isinstance(table_data, list) else table_data.get("fks", [])
        
        col_defs = []
        # Columns
        for col in columns:
            col_defs.append(f"  {col['name']} {col['type']}")
            
        # Primary Key (heuristic: if 'id' exists)
        if any(c['name'] == 'id' for c in columns):
            col_defs.append("  PRIMARY KEY (id)")
            
        # Foreign Keys
        for fk in fks:
            col_defs.append(f"  FOREIGN KEY ({fk['column']}) REFERENCES {fk['foreign_table']}({fk['foreign_column']})")
            
        create_stmt = f"CREATE TABLE {table_name} (\n" + ",\n".join(col_defs) + "\n);"
        ddl_statements.append(create_stmt)
        
    return "\n\n".join(ddl_statements)

def generate_sql(prompt: str, schema_context: str = None, schema_data: dict = None, history: list = None, model: str = "qwen2.5-coder", connection = None) -> dict:
    """
    Generates SQL based on a prompt and schema context using Ollama.
    Accepts specific schema_data to generate DDL context on the fly.
    Supports server-side validation/retry if 'connection' is provided.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    # Format history if present
    # USER REQUESTED TO DISABLE HISTORY FOR NOW
    history_text = ""
    # if history:
    #     history_text = "### Conversation History\n"
    #     for msg in history:
    #         role = msg.get("role", "user").upper()
    #         content = msg.get("content", "")
    #         if role == "ASSISTANT" and msg.get("isCode"):
    #             # If it was code, wrap it
    #             content = f"```sql\n{content}\n```"
    #         history_text += f"{role}: {content}\n"
    #     history_text += "\n"

    def build_prompt(context_str, error_msg=None):
        base_prompt = (
            "You are a helpful SQL Assistant. Your goal is to generate correct, efficient SQL queries.\n\n"
            "### Database Schema\n"
            f"{context_str}\n\n"
            "### Task\n"
            "Generate a SQL query to answer the following question.\n"
            f"{history_text}"
            f"Current Request: {prompt}\n\n"
            "### Guidelines\n"
            "1. Output ONLY the SQL code block. No conversational text.\n"
            "2. Use markdown formatting: ```sql ... ```\n"
            "3. Ensure column names and table names exist in the schema.\n"
            "4. Use `NULLS LAST` for sorting.\n"
            "5. Use `limit 10` if the result could be large.\n"
        )
        if error_msg:
            base_prompt += f"\n\n!!! PREVIOUS ATTEMPT FAILED !!!\nError: {error_msg}\nFIX THE SQL AND RETURN ONLY THE FIXED SQL."
        return base_prompt

    # ... existing retry loop ...

def explain_sql_query(query: str, schema_context: str = None, schema_data: dict = None, model: str = "qwen2.5-coder"):
    """
    Generates a natural language explanation for a given SQL query.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    prompt = (
        "You are an expert SQL Tutor. Explain the following SQL query clearly and concisely to a user.\n"
        "Focus on the logical flow: what tables are joined, what filters are applied, and what the result represents.\n\n"
        "### Database Schema\n"
        f"{schema_context}\n\n"
        "### SQL Query\n"
        f"```sql\n{query}\n```\n\n"
        "### Instructions\n"
        "- Provide a summary of what the query does.\n"
        "- Explain key parts (Joins, WHERE clauses).\n"
        "- Do NOT reproduce the code, just explain the logic.\n"
        "- Use bullet points for clarity.\n"
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": { "temperature": 0.2 }
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=120)
        response.raise_for_status()
        return response.json().get("response", "Could not generate explanation.")
    except Exception as e:
        logger.error(f"Explanation failed: {e}")
        return f"Error generating explanation: {str(e)}"

    # Retry Loop
    max_retries = 1
    current_error = None
    final_sql = None
    final_message = None # Full text
    debug_prompt = build_prompt("-- [SCHEMA HIDDEN FOR DEBUGGING] --")

    import re # Ensure re is imported locally if not at top

    for attempt in range(max_retries + 1):
        full_prompt = build_prompt(schema_context, current_error)
        
        # Log Prompt (omitted for brevity, assume existing log code)
        
        payload = {
            "model": model, 
            "prompt": full_prompt,
            "stream": False,
            "options": { "temperature": 0.2 }
        }

        try:
            logger.info(f"Generating SQL (Attempt {attempt+1})...")
            response = requests.post(OLLAMA_URL, json=payload, timeout=120)
            response.raise_for_status()
            data = response.json()
            ai_response = data.get("response", "-- No response generated")
            final_message = ai_response

            # Extract SQL using Regex
            match = re.search(r"```sql\s*(.*?)\s*```", ai_response, re.DOTALL | re.IGNORECASE)
            if match:
                clean_sql = match.group(1).strip()
            else:
                # Fallback: legacy simple strip if they forgot markdown or it's a raw fix
                clean_sql = ai_response.replace("```sql", "").replace("```", "").strip()

            # If we primed with SELECT/WITH, assumes it's raw. 
            # But with markdown enforcement, clean_sql should be pure code now.
            
            final_sql = clean_sql 

            # Validation
            if connection:
                try:
                    logger.info("Validating SQL with EXPLAIN...")
                    from app.explain import execute_explain
                    execute_explain(connection, clean_sql, analyze=False)
                    logger.info("SQL Validation Passed.")
                    break # Success!
                except Exception as e:
                    logger.error(f"SQL Validation Failed: {e}")
                    current_error = str(e)
                    # Loop continues
            else:
                 break # No validation possible

        except Exception as e:
            logger.error(f"AI Generation failed: {e}")
            return {
                "message": f"-- Error: {str(e)}",
                "sql": None,
                "prompt": debug_prompt
            }

    return {
        "message": final_message, # Full explanation + code
        "sql": final_sql,         # Clean code for execution logic
        "prompt": debug_prompt
    }

def generate_sql_stream(prompt: str, schema_context: str = None, schema_data: dict = None, history: list = None, model: str = "qwen2.5-coder"):
    """
    Generator that streams the response from Ollama.
    Skips server-side validation/retry to allow real-time feedback.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    # Use the same prompt builder
    # We must access build_prompt somehow. It was inner function. 
    # Let's copy the prompt logic or extract it. 
    # Extracting is cleaner but risky refactor. 
    # I will inline the essential prompt logic for the stream function to be safe and self-contained.
    
    # ... (Prompt Construction similar to generate_sql) ...
    base_prompt = (
        "You are a helpful SQL Assistant. Your goal is to generate correct, efficient SQL queries.\n\n"
        "### Database Schema\n"
        f"{schema_context}\n\n"
        "### Task\n"
        "Generate a SQL query to answer the following question.\n"
        f"Current Request: {prompt}\n\n"
        "### Guidelines\n"
        "1. Output ONLY the SQL code block. No conversational text.\n"
        "2. Use markdown formatting: ```sql ... ```\n"
        "3. Ensure column names and table names exist in the schema.\n"
        "4. Use `NULLS LAST` for sorting.\n"
        "5. Use `limit 10` if the result could be large.\n"
        "6. Use CTEs (WITH clauses) ONLY if the query is complex (e.g. multiple aggregations). For simple top-N queries, a standard SELECT is preferred.\n"
    )

    payload = {
        "model": model, 
        "prompt": base_prompt,
        "stream": True,  # ENABLE STREAMING
        "options": { "temperature": 0.2 }
    }

    try:
        with requests.post(OLLAMA_URL, json=payload, stream=True, timeout=120) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if line:
                    body = json.loads(line)
                    token = body.get("response", "")
                    if token:
                        yield token
    except Exception as e:
        logger.error(f"Stream failed: {e}")
        yield f"\n-- Error: {str(e)}"

