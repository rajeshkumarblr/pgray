import logging
import requests
import httpx # Async Support
import json
import datetime
import time

import os

from app.search_engine import search_database


logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")

def format_schema_ddl(schema: dict) -> str:
    """
    Converts the schema dictionary to SQL DDL (CREATE TABLE) statements.
    """
    if not schema:
        return ""
        
    ddl_statements = []
    
    for table_name, table_data in schema.items():
        # Ensure we work with dicts
        if isinstance(table_data, list):
             # Legacy format handling? Assume list is columns?
             columns = table_data
             fks = []
        else:
             columns = table_data.get("columns", [])
             fks = table_data.get("fks", [])
        
        col_defs = []
        # Columns (Quote names)
        for col in columns:
            col_defs.append(f"  \"{col['name']}\" {col['type']}")
            
        # Primary Key (heuristic)
        if any(c['name'] == 'id' for c in columns):
            col_defs.append("  PRIMARY KEY (\"id\")")
            
        # Foreign Keys
        for fk in fks:
            col_defs.append(f"  FOREIGN KEY (\"{fk['column']}\") REFERENCES \"{fk['foreign_table']}\"(\"{fk['foreign_column']}\")")
            
        create_stmt = f"CREATE TABLE \"{table_name}\" (\n" + ",\n".join(col_defs) + "\n);"
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

    elif not schema_context:
        schema_context = "-- No schema provided"

    # --- LOCAL SEARCH ENGINE INTEGRATION ---
    data_context = ""
    if connection:
        # Heuristic: Extract quoted strings or capitalized words as search terms
        import re
        # Find 'quoted strings' or words with >3 chars that aren't SQL keywords?
        # Simplest: Just search the whole prompt if it's short, or key phrases.
        # Let's search for words inside single/double quotes as high signal.
        possible_terms = re.findall(r"['\"](.*?)['\"]", prompt)
        
        # Also simple words if no quotes?
        if not possible_terms:
             # Just split and take long words? Too noisy.
             # Let's assume user might say: Find Titanium Widget
             # We can try to search the whole prompt against index if index is efficient?
             # For now, let's strictly search quoted things OR if the prompt is short < 5 words.
             pass

        search_results = []
        for term in possible_terms:
            if len(term) > 2:
                 results = search_database(connection, term, limit=3)
                 search_results.extend(results)
        
        if search_results:
            data_context = "### Data Context (Found in Database)\n"
            data_context += "The following values were found in the database. Use their IDs or Exact Spelling if relevant:\n"
            for res in search_results:
                # res is dict: table_name, column_name, original_value, record_id
                data_context += f"- Value '{res['original_value']}' found in `{res['table_name']}`.`{res['column_name']}` (ID: {res['record_id']})\n"
            data_context += "\n"

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
            "## Instructions\n"
            "You are an expert PostgreSQL Data Analyst. Your goal is to write the most accurate SQL query for the user's question.\n\n"
            "## Process\n"
            "1.  **Identify the Subject:** What is the main entity the user wants to list? (e.g., Customers, Orders, Patients, Transactions).\n"
            "    -   *Rule:* If the user asks for a specific Subject, that Subject's Name/ID MUST appear in the generic `SELECT` clause. Do not aggregate it away unless explicitly asked to \"count\" or \"summarize\".\n"
            "2.  **Identify the Metrics:** What value are we measuring? (e.g., Total Sales, Count of Visits).\n"
            "3.  **Generate SQL:** Write standard PostgreSQL code.\n\n"
            "## Constraint Checklist & Confidence Score\n"
            "1. Does the query return the columns requested?\n"
            "2. Are the joins correct based on Foreign Keys?\n"
            "3. Confidence Score: 1-5\n\n"
            "### Database Schema\n"
            f"{context_str}\n\n"
            f"{data_context}\n\n"
            "### Task\n"
            f"{history_text}"
            f"Current Request: {prompt}\n\n"
            "CRITICAL:\n"
            "1. Do not assume column names based on your training data. You MUST strictly use the column names provided in the CREATE TABLE definitions above. If a column is not in the schema, do not hallucinate it.\n"
            "2. DO NOT use backticks (`). Use double quotes (\") for identifiers if needed (e.g. \"Order Details\").\n\n"
            "### Output\n"
            "Return ONLY the SQL code block. No conversational text.\n"
            "```sql\n"
            "SELECT ...\n"
            "```"
        )
        if error_msg:
            base_prompt += f"\n\n!!! PREVIOUS ATTEMPT FAILED !!!\nError: {error_msg}\nFIX THE SQL AND RETURN ONLY THE FIXED SQL."
        return base_prompt



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
            "keep_alive": "60m",
            "options": { "temperature": 0.2 }
        }

        try:
            logger.info(f"Generating SQL (Attempt {attempt+1})...")
            response = requests.post(OLLAMA_URL, json=payload, timeout=300)
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

def explain_sql_query(query: str, schema_context: str = None, schema_data: dict = None, model: str = "qwen2.5-coder"):
    """
    Generates a natural language explanation for a given SQL query.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    prompt = (
        "You are a concise Data Analyst.\n"
        "Provide a single short paragraph (2-3 sentences max) explaining the business logic of this query.\n"
        "Do NOT mention specific SQL keywords (like JOIN, GROUP BY) unless critical.\n"
        "Do NOT provide a line-by-line breakdown.\n"
        "End with: 'Let me know if you want a detailed breakdown.'\n\n"
        "### Database Schema\n"
        f"{schema_context}\n\n"
        "### SQL Query\n"
        f"```sql\n{query}\n```"
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "60m",
        "options": { "temperature": 0.2 }
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=300)
        response.raise_for_status()
        return response.json().get("response", "Could not generate explanation.")
    except Exception as e:
        logger.error(f"Explanation failed: {e}")
        return f"Error generating explanation: {str(e)}"

async def generate_sql_stream(prompt: str, schema_context: str = None, schema_data: dict = None, history: list = None, model: str = "qwen2.5-coder", plan_text: str = None, sql_query: str = None, apiKey: str = None, ollamaUrl: str = None, connection: dict = None):
    """
    Async Generator that streams the response from Ollama using httpx.
    """
    # Use custom URL if provided, else default
    active_ollama_url = ollamaUrl if ollamaUrl else OLLAMA_URL
    # Ensure no trailing slash for consistency if we append /api/...
    active_ollama_url = active_ollama_url.rstrip('/')

    schema_text = ""
    if schema_data:
        schema_text = format_schema_ddl(schema_data)
    elif schema_context:
        schema_text = schema_context
    else:
        schema_text = "-- No schema provided"

    # --- LOCAL SEARCH ENGINE INTEGRATION (Stream) ---
    data_context = ""
    if connection:
        try:
            import re
            # Extract quoted strings or simple heuristic
            possible_terms = re.findall(r"['\"](.*?)['\"]", prompt)
            
            search_results = []
            for term in possible_terms:
                if len(term) > 2:
                     # Search DB - This is synchronous, but fast enough? Or should be async?
                     # search_database uses psycopg2, which is sync.
                     # We are in async def. 
                     # Ideally we offload to thread, but for MVP keep it simple (it blocks loop briefly).
                     results = search_database(connection, term, limit=3)
                     search_results.extend(results)
            
            if search_results:
                data_context = "### Data Context (Found in Database)\n"
                data_context += "The following values were found in the database. Use their IDs or Exact Spelling if relevant:\n"
                for res in search_results:
                    data_context += f"- Value '{res['original_value']}' found in `{res['table_name']}`.`{res['column_name']}` (ID: {res['record_id']})\n"
                data_context += "\n"
        except Exception as e:
            logger.error(f"Search Context Injection failed: {e}")
            pass

    # optimization context
    optimization_context = ""
    if sql_query:
        optimization_context += f"### Current SQL Query\n```sql\n{sql_query}\n```\n\n"
    if plan_text:
        optimization_context += f"### Execution Plan (Text)\n```text\n{plan_text}\n```\n\n"
    
    # Always disable title for now as per user request
    title_instruction = "1. Do NOT output a Title line. Start directly with the SQL block.\n"

    # ... Prompt construction ...
    if plan_text:
        # TUNE/ANALYSIS MODE
        base_prompt = (
            "You are a helpful SQL Assistant. Your goal is to analyze execution plans and suggest optimizations.\n"
            "You have been provided with an execution plan.\n"
            "   - Analyze it for performance bottlenecks (like Seq Scans, high cost nodes).\n"
            "   - SUGGEST INDEXES if missing.\n"
            "   - Provide ONLY the `CREATE INDEX` statements in their own `sql` code blocks for the user to run.\n"
            "   - Do NOT repeat the original SELECT query unless you are purposely rewriting it for logic.\n"
            "   - Explain WHY these indexes will help.\n\n"
            "### Database Schema\n"
            f"{schema_text}\n\n"
            f"{optimization_context}"
            f"{data_context}"
            "### Task\n"
            "Analyze the plan and suggest optimizations/indexes.\n"
            f"User Note: {prompt}\n\n"
            "### Guidelines\n"
            "1. Use natural language (Markdown) for analysis/explanations.\n"
            "2. Wrap SQL code in markdown: ```sql ... ```\n"
        )
    else:
        # GENERATION MODE
        base_prompt = (
            "You are a helpful SQL Assistant. Your goal is to generate correct, efficient SQL queries.\n"
            "### Database Schema\n"
            f"{schema_text}\n\n"
            f"{optimization_context}"
            f"{data_context}"
            "### Task\n"
            "Generate a SQL query to answer the following question.\n"
            f"Current Request: {prompt}\n\n"
            "### Guidelines\n"
            "1. Output ONLY the SQL code block. Do NOT include any 'Title:' line.\n"
            "2. Output valid SQL to answer the question.\n"
            "3. Use markdown formatting: ```sql ... ```\n"
            "4. Ensure column names and table names exist in the schema.\n"
            "5. **CRITICAL**: If you use `ORDER BY` clause, you MUST specify `NULLS LAST`.\n"
            "6. **CRITICAL**: If the user asks for 'acted by' or 'movies with actor' or 'actress', you MUST join the `jobs` table to filter by job type. The ONLY valid job name for actors/actresses is 'Actor'. Do NOT use 'Actress'.\n"
            "7. **IMPORTANT**: If the user input contains an entity with an ID (e.g. 'Brad Pitt (ID: 287)'), you MUST prefer filtering by the NAME string (e.g. `WHERE name = 'Brad Pitt'`) rather than the ID. Exception: Use IDs only for non-human-readable foreign keys (like UUIDs) or if the name is ambiguous.\n"
            "8. Output ONLY the SQL code block. Do NOT include any explanations, introductions, or 'Here is the SQL'.\n"
        )


    payload = {
        "model": model, 
        "prompt": base_prompt,
        "keep_alive": "60m", # Keep model loaded for 1 hour
        "stream": True,  # ENABLE STREAMING
        "options": { "temperature": 0.1 } # Lower temperature for diffs
    }

    if model.startswith("gemini"):
        if not apiKey:
             yield json.dumps({"error": "Gemini model selected but no API Key provided."}) + "\n"
             return
        
        
        # generate_gemini_stream is defined in this module
        async for chunk in generate_gemini_stream(base_prompt, model, apiKey):
             yield chunk
        return

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            start_time = time.time()
            target_url = active_ollama_url
            if "/api/generate" not in target_url:
                 target_url = f"{active_ollama_url}/api/generate"

            # print(f"DEBUG: sending to {target_url}")
            async with client.stream("POST", target_url, json=payload) as response:
                if response.status_code != 200:
                    error_detail = await response.aread()
                    logger.error(f"Ollama API error: {response.status_code} - {error_detail.decode()}")
                    yield json.dumps({"error": f"Ollama API error: {response.status_code} - {error_detail.decode()}"}) + "\n"
                    return

                full_response = ""
                first_chunk = True
                async for line in response.aiter_lines():
                    if line:
                        if first_chunk:
                            ttft = time.time() - start_time
                            logger.info(f"Create SQL Stream TTFT: {ttft:.4f}s")
                            first_chunk = False
                        body = json.loads(line)
                        token = body.get("response", "")
                        if token:
                            full_response += token
                            yield json.dumps({"response": token}) + "\n"
                logger.info(f"✅ Generated Stream:\n{full_response}")
    except Exception as e:
        logger.error(f"Stream failed: {e}")
        yield json.dumps({"error": str(e)}) + "\n"


async def generate_title(prompt: str, model: str = "qwen2.5-coder") -> str:
    """
    Generates a short 3-5 word title for the session based on the prompt.
    """
    sys_prompt = (
        "You are a helpful assistant. Summarize the following user request into a short, concise title (3-5 words max).\n"
        "Do NOT include quotes. Do NOT include 'Title:'. Just the words.\n"
        "Example: 'Top 5 Movies Revenue'"
    )
    
    payload = {
        "model": model, 
        "prompt": f"{sys_prompt}\nUser Request: {prompt}\nTitle:",
        "keep_alive": "60m",
        "stream": False,
        "options": { "temperature": 0.3 }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OLLAMA_URL, json=payload, timeout=30)
            response.raise_for_status()
            title = response.json().get("response", "").strip().strip('"').strip("'")
            return title if title else "Untitled Session"

    except Exception as e:
        logger.error(f"Title generation failed: {e}")
        return "Untitled Session"

async def analyze_parameterized_query(sql_query: str, model: str = "qwen2.5-coder", existing_title: str = None) -> dict:
    """
    Analyzes SQL to propose a Title and potential Parameters.
    Can accept an existing_title to skip generation.
    """
    
    logger.info(f"DEBUG: analyze_parameterized_query called with SQL: {sql_query}")

    # 1. Regex Detection for existing parameters (e.g. :name)
    # Basic regex to find :word. Avoids ::cast (postgres). 
    # Look for : followed by word chars, ensuring not preceded by : (cast)
    import re
    # Negative lookbehind for :, match : then word.
    # Also careful about quotes? 
    # For now, simplistic regex: (?<!:):([a-zA-Z_][a-zA-Z0-9_]*)
    regex_params = []
    try:
        matches = re.finditer(r'(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)', sql_query)
        seen = set()
        for m in matches:
            p_name = m.group(1)
            if p_name not in seen:
                # Basic check to ensure it's not inside a string literal? 
                # This is hard without full parser. 
                # But typically :param is distinct. 
                # We will assume it's a param.
                regex_params.append({
                    "name": p_name,
                    "original_value": f":{p_name}", # No-op replacement
                    "table": None,
                    "column": None,
                    "active": True # Already active
                })
                seen.add(p_name)
    except Exception as e:
        logger.error(f"Regex param detection failed: {e}")

    logger.info(f"DEBUG: Regex found params: {regex_params}")

    # 2. AI Analysis for Literals (and Title if needed)
    
    # If we have title, we can simplify the prompt
    title_instruction = "2. Suggest a short, descriptive Title (3-5 words)."
    if existing_title:
        title_instruction = "2. Title: Return null (we have one)."

    prompt = (
        "You are an expert SQL Assistant.\n"
        "1. Analyze the given SQL query.\n"
        f"{title_instruction}\n"
        "3. Identify ALL literal values (strings, numbers) in WHERE/HAVING clauses OR LIMIT/OFFSET clauses that could be NEW parameters.\n"
        "4. ALSO analyze any EXISTING parameters (starting with :) found in the query.\n"
        "5. For each parameter (new or existing), identify the TABLE and COLUMN it is filtering (Use null if not applicable).\n"
        "6. **CRITICAL**: If the column has a FUNCTION applied to it (e.g., EXTRACT(YEAR FROM col), DATE_TRUNC('month', col)), capture the function as 'transform'.\n"
        "   - Use placeholder {} to indicate where the column goes.\n"
        "   - Example: EXTRACT(YEAR FROM m.date) = :year -> transform: 'EXTRACT(YEAR FROM {})'\n"
        "   - Example: DATE_TRUNC('month', created_at) = :month -> transform: 'DATE_TRUNC(\\'month\\', {})'\n"
        "7. **IMPORTANT**: Only extract a number as a parameter if it is a standalone value.\n"
        "8. **IMPORTANT**: For LIMIT/OFFSET, naming should be 'limit_val' or 'offset_val'.\n"
        "9. Output valid JSON.\n\n"
        f"Input SQL:\n```sql\n{sql_query}\n```\n\n"
        "Output Format:\n"
        "{\n"
        "  \"title\": \"Movies by Year\",\n"
        "  \"parameters\": [\n"
        "    { \n"
        "      \"name\": \"year\", \n"
        "      \"original_value\": \":year\", \n"
        "      \"table\": \"movies\", \n"
        "      \"column\": \"date\",\n"
        "      \"transform\": \"EXTRACT(YEAR FROM {})\" \n"
        "    }\n"
        "  ]\n"
        "}"
    )
    
    payload = {
        "model": model, 
        "prompt": prompt,
        "stream": False,
        "keep_alive": "60m",
        "format": "json",
        "options": { "temperature": 0.1 }
    }
    
    ai_result = { "title": existing_title or "Untitled Query", "parameters": [] }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OLLAMA_URL, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            content = data.get("response", "")
            
            try:
                # Try to extract JSON structure directly
                json_match = re.search(r"(\{.*\})", content, re.DOTALL)
                if json_match:
                    content = json_match.group(1).strip()
                
                parsed = json.loads(content)
                
                # Use AI title if we don't have one
                if not existing_title and "title" in parsed:
                    ai_result["title"] = parsed["title"]
                    
                if "parameters" in parsed and isinstance(parsed["parameters"], list):
                    # Filter bad AI params
                    for p in parsed["parameters"]:
                         if isinstance(p, dict) and "name" in p and "original_value" in p:
                            if "table" not in p: p["table"] = None
                            if "column" not in p: p["column"] = None
                            ai_result["parameters"].append(p)
                            
            except json.JSONDecodeError:
                 pass # Keep defaults
                 
    except Exception as e:
        logger.error(f"Analyze Query failed: {e}")
        # Return what we found via regex at least!
        
    # 3. Merge Regex Params into AI Params
    # Priority: Keep existing regex params (high confidence they are intended).
    # AI might have found literals.
    # Deduplicate by name?
    
    final_params = list(regex_params) # Start with explicit
    # deduplicate by name AND original_value
    existing_map = {p["name"]: p for p in final_params} # Map for easy update
    existing_values = set(p["original_value"] for p in regex_params)
    
    for ai_p in ai_result["parameters"]:
        # 1. Check for Name Match (Merge Metadata)
        if ai_p["name"] in existing_map:
            # MERGE METADATA: If AI found table/col/transform for an existing regex param, enrich it!
            existing = existing_map[ai_p["name"]]
            if not existing.get("table") and ai_p.get("table"):
                existing["table"] = ai_p["table"]
            if not existing.get("column") and ai_p.get("column"):
                existing["column"] = ai_p["column"]
            if not existing.get("transform") and ai_p.get("transform"):
                existing["transform"] = ai_p["transform"]
            continue

        # 2. Skip if AI suggests satisfying an existing values literal entirely (deduplication for new params)
        if ai_p["original_value"] in existing_values:
            continue
            
        # 3. Add new param
        # Skip heuristic ":limit"
        if ai_p["original_value"].startswith(":") and not ai_p["original_value"].startswith("::"):
             continue

        final_params.append(ai_p)
            
    final_result = {
        "parameters": final_params
    }
    
    return final_result

async def list_models() -> list:
    """
    Fetches available models from Ollama /api/tags.
    """
    try:
        # Construct base URL from OLLAMA_URL
        # OLLAMA_URL defaults to .../api/generate
        base_url = OLLAMA_URL.replace("/api/generate", "")
        tags_url = f"{base_url}/api/tags"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(tags_url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                # Ollama returns { "models": [ { "name": "..." }, ... ] }
                models = [m["name"] for m in data.get("models", [])]
                return models
                
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
    
    # Fallback
    return ["qwen2.5-coder:latest", "qwen2.5-coder", "llama3", "mistral"]

async def warmup_model(model: str = "qwen2.5-coder:latest"):
    """
    Sends a keep-alive request to Ollama to load the model into memory.
    """
    try:
        # Just sending an empty generate request with keep_alive
        payload = {
            "model": model,
            "prompt": "", 
            "keep_alive": "60m",
            "stream": False
        }
        async with httpx.AsyncClient() as client:
            # We don't care about the response, just triggering the load
            # Use short timeout, if it times out, the load is arguably started? 
            # Actually, Ollama blocks until loaded.
            # So we should run this fire-and-forget or async?
            # The client (frontend) shouldn't wait 60s for warmup.
            # So we set timeout to 1s? 
            # If we timeout, the request might be cancelled by Ollama?
            # Better to let it run in background task? 
            # FastAPI BackgroundTasks is perfect here.
            # BUT for now, let's just send the request with a small timeout and catch exception.
            # If it's already loaded, it returns instantly.
            # If loading, it will block. 
            await client.post(OLLAMA_URL, json=payload, timeout=1.0)
    except httpx.TimeoutException:
        # Expected if model is loading
        pass 
    except Exception as e:
        logger.error(f"Warmup failed: {e}")

async def generate_gemini_stream(prompt: str, model: str, api_key: str):
    """
    Streams response from Google Gemini API.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1}
    }
    
    try:
        async with httpx.AsyncClient() as client:
            logger.info(f"DEBUG: Gemini URL: {url.replace(api_key, 'HIDDEN')}") # Redact key
            async with client.stream("POST", url, json=payload, timeout=60) as response:
                if response.status_code != 200:
                    err_text = await response.aread()
                    error_msg = err_text.decode('utf-8')
                    logger.error(f"Gemini Error {response.status_code}: {error_msg}")
                    
                    if response.status_code == 404:
                         # Try to list models to help debug
                         try:
                             list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                             list_resp = await client.get(list_url, timeout=10)
                             if list_resp.status_code == 200:
                                 models_data = list_resp.json()
                                 avail = [m.get('name') for m in models_data.get('models', [])]
                                 logger.info(f"DEBUG: Available Gemini Models: {avail}")
                             else:
                                 logger.error(f"Failed to list models: {list_resp.status_code}")
                         except Exception as list_e:
                             logger.error(f"Failed to list models exception: {list_e}")

                    yield json.dumps({"error": f"Error from Google: {response.status_code} {error_msg}"}) + "\n"
                    return

                # Gemini returns a JSON array '[' ... ',' ... ',' ... ']'
                # Use a buffer to handle potentially split JSON chunks, or simplistic parsing
                # Actually, standard usage is parsing line by line if possible, or chunk by chunk
                # But Gemini returns a continuous JSON list.
                # Simplify: naive parsing for "text": "..."
                # Or use the fact that chunks usually come as complete JSON objects wrapped in the list structure.
                
                async for line in response.aiter_lines():
                    if line:
                        # Simple regex to extract text to ensure we don't break on complex JSON parsing
                        # We look for "text": "..."
                        # BUT Gemini logic: candidates[0].content.parts[0].text
                        import re
                        # Non-greedy match for text value. Handle escaped quotes?
                        # This is risky. Better to try loading JSON if possible.
                        # Clean the line: remove leading ',' or '[' or ']'
                        cleaned = line.strip().lstrip(',').lstrip('[').rstrip(']').rstrip(',')
                        if not cleaned: continue
                        
                        # Strategy 1: Attempt to parse full object (existing)
                        try:
                            # logger.info(f"DEBUG: Gemini Line: {cleaned}")
                            data = json.loads(cleaned)
                            # Extract text
                            candidates = data.get("candidates", [])
                            if candidates:
                                content = candidates[0].get("content", {})
                                parts = content.get("parts", [])
                                if parts:
                                    text = parts[0].get("text", "")
                                    if text:
                                        # logger.info(f"DEBUG: yielded {text}")
                                        yield json.dumps({"response": text}) + "\n"
                            continue # Success
                        except:
                            pass

                        # Strategy 2: Handle partial line like "text": "..."
                        # Gemini often sends this key-value pair on its own line in the stream
                        if '"text":' in cleaned:
                            try:
                                # Construct a fake object to let JSON parser handle escaping
                                # Remove trailing comma if present
                                fragment = cleaned.rstrip(',')
                                # If it doesn't start with Brace, wrap it
                                if not fragment.startswith('{'):
                                    fragment = '{' + fragment + '}'
                                
                                data = json.loads(fragment)
                                if "text" in data:
                                    yield json.dumps({"response": data["text"]}) + "\n"
                            except Exception as e:
                                # logger.error(f"Gemini Fragment Parse Error: {cleaned} | {e}")
                                pass

    except Exception as e:
        logger.error(f"Gemini stream failed: {e}")
        yield json.dumps({"error": str(e)}) + "\n"

def fix_sql_query(sql: str, error: str, schema_context: str = None, schema_data: dict = None, model: str = "qwen2.5-coder") -> str:
    """
    Repairs a failed SQL query using the error message and schema.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    prompt = (
        f"The following SQL query failed validation:\n\n```sql\n{sql}\n```\n\n"
        f"Error: {error}\n\n"
        "Correct the SQL query to resolve this error. Use the provided schema strictly.\n"
        "CRITICAL: DO NOT use backticks (`). Use double quotes (\") for identifiers if needed (e.g. \"table_name\").\n\n"
        "### Database Schema\n"
        f"{schema_context}\n\n"
        "### Output\n"
        "Return ONLY the FIXED SQL code block. No conversational text.\n"
    )

    try:
        payload = {
            "model": model, 
            "prompt": prompt,
            "stream": False,
            "options": { "temperature": 0.1 } # Lower temp for fixes
        }
        
        logger.info(f"Fixing SQL...")
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()
        ai_response = data.get("response", "")
        
        # Extract SQL using Regex
        import re
        match = re.search(r"```sql\s*(.*?)\s*```", ai_response, re.DOTALL | re.IGNORECASE)
        if match:
            return match.group(1).strip()
        
        # Fallback
        clean_sql = ai_response.replace("```sql", "").replace("```", "").strip()
        return clean_sql

    except Exception as e:
        logger.error(f"Failed to fix SQL: {e}")
        return sql # Return original if fix fails
