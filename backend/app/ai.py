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
    Generates SQL based on a prompt and schema context using Ollama (Agentic).
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    # --- AGENTIC TOOLS ---
    def list_tables_tool(connection) -> str:
        """List all tables in the database."""
        try:
            from app.db_utils import get_tables
            tables = get_tables(connection)
            if not tables:
                return "No tables found in public schema."
            return ", ".join([t['name'] for t in tables])
        except Exception as e:
            return f"Error: {str(e)}"

    def get_schema_tool(connection, table_name: str) -> str:
        """Get schema for a specific table."""
        try:
            from app.explain import get_schema_for_table
            from app.ai import format_schema_ddl # Ensure available or moved
            
            # 1. Try schema_data cache first
            if schema_data and table_name in schema_data:
                tbl = schema_data[table_name]
                return format_schema_ddl({table_name: tbl})
            
            # 2. Fetch from DB
            schema_info = get_schema_for_table(connection, table_name)
            if schema_info:
                return format_schema_ddl({table_name: schema_info})

            return f"Table '{table_name}' not found."
        except Exception as e:
            return f"Error: {e}"

    def run_sql_tool(connection, query: str) -> str:
        """Run a SQL query to inspect data (Limit 5)."""
        try:
            # Safety: Limit 5
            if "limit" not in query.lower():
                query += " LIMIT 5"
            from app.explain import execute_query_results
            res = execute_query_results(connection, query)
            if res.get("error"): return f"Error: {res['error']}"
            return str(res['rows'])
        except Exception as e:
            return f"Error executing SQL: {e}"

    # --- AGENT LOOP ---
    # We use a ReAct pattern: Thought -> Action -> Observation
    max_turns = 10 # Allow more turns for complex schemas
    chat_history = f"User Request: {prompt}\n\n"
    
    # System Prompt for Agent
    system_prompt = (
        "You are an Agentic SQL Architect. Your goal is to write the correct SQL for the user.\n"
        "You have access to these tools:\n"
        "1. `list_tables()`: See all table names.\n"
        "2. `get_schema(table_name)`: Get CREATE TABLE statement for a table.\n"
        "3. `sample_data(sql)`: Run a SQL query (read-only) to see data samples. Use this to check values (e.g. 'is it 'USA' or 'United States'?').\n\n"
        "Protocol:\n"
        "1. Thought: ... (Explain your reasoning. Plan all steps: identifying tables, inspecting schemas, then querying.)\n"
        "2. Action: `tool_name(args)` (MUST start with 'Action:', do NOT use code blocks for Actions)\n"
        "3. Wait for Observation.\n"
        "4. Repeat until you are confident.\n"
        "5. Final Answer: ```sql ... ```\n\n"
        "Rules:\n"
        "- Do NOT guess column names. Use `get_schema` for ALL relevant tables.\n"
        "- Do NOT guess values (IDs). Use `sample_data` to look them up.\n"
        "- PREFER joining by names (e.g. `category_name = 'Beverages'`) over IDs (e.g. `category_id = 1`) if possible.\n"
        "- The database uses snake_case.\n"
        "- ALWAYS start with `list_tables()` if you are unsure of table names.\n"
        "- Do NOT repeat the same Action immediately.\n"
    )

    import re
    
    # If we have a connection, run the loop. Else fallback to one-shot.
    if connection:
        current_context = system_prompt + "\n" + chat_history
        last_action = None
        past_actions = set() # Track all unique actions to prevent cycles
        
        for turn in range(max_turns):
            # Call LLM
            # We need to construct the prompt with history
            payload = {
                "model": model, 
                "prompt": current_context + f"\n(Turn {turn+1}/{max_turns}) Thought:",
                "stream": False,
                "options": { "temperature": 0.0, "stop": ["Observation:"] } # Stop at Observation
            }
            
            try:
                response = requests.post(OLLAMA_URL, json=payload, timeout=60)
                response.raise_for_status()
                ai_text = response.json().get("response", "").strip()
                
                # Append Thought to context
                current_context += f"\n(Turn {turn+1}) Thought: {ai_text}\n"
                logger.info(f"Agent Turn {turn}: {ai_text}")

                # Check for Action
                # 1. Standard "Action: tool(args)" with flexible spacing/quoting
                # Match `Action: ` optionally followed by backticks/quotes, then tool name, then `(`, then args, then `)`
                action_pattern = r"Action:\s*[`'\"]?(\w+)[`'\"]?\s*\((.*)\)"
                action_match = re.search(action_pattern, ai_text, re.IGNORECASE)

                
                # 2. Fallback: Check for code block usage `tool(args)` if standard fails
                if not action_match:
                     # Match ```sql\ntool(args)\n``` or just `tool(args)` at start of line
                     fallback_match = re.search(r"^\s*`?(\w+)\((.*)\)`?", ai_text, re.MULTILINE)
                     # Only accept if tool is valid
                     if fallback_match and fallback_match.group(1).lower() in ["list_tables", "get_schema", "sample_data"]:
                         action_match = fallback_match

                if action_match:
                    tool = action_match.group(1).lower()
                    
                    # Args parsing
                    raw_args = action_match.group(2).strip()
                    # Clean up: remove potential trailing `)` or backticks if the regex was loose
                    args = raw_args.strip("'").strip('"').strip("`") # Cleanup quotes
                    
                    # Loop Detection
                    current_action = f"{tool}({args})"
                    
                    # BLOCKER 1: Immediate Repeat
                    if current_action == last_action:
                         observation = "Error: You just ran this EXACT action and it failed or you are repeating yourself. You MUST change the arguments. Do not repeat the same command."
                    
                    # BLOCKER 2: Cycle Detection (A -> B -> A)
                    # For `list_tables` and `get_schema`, once is enough.
                    elif tool in ["list_tables", "get_schema"] and current_action in past_actions:
                         observation = f"Error: You have ALREADY run {current_action}. Do not run it again. You have the information in your history. Move to the next step (sample_data or Final Answer)."
                    
                    else:
                        last_action = current_action
                        past_actions.add(current_action)
                        
                        observation = ""
                        if tool == "list_tables":
                            observation = list_tables_tool(connection)
                        elif tool == "get_schema":
                            observation = get_schema_tool(connection, args)
                        elif tool == "sample_data":
                            observation = run_sql_tool(connection, args)
                        else:
                            observation = f"Error: Unknown tool '{tool}'"
                    
                    current_context += f"Observation: {observation}\n"
                    logger.info(f"Observation: {observation}") # Log FULL observation
                if "Final Answer:" in ai_text:
                    final_sql = ai_text.split("Final Answer:")[-1]
                    final_sql = cleanup_sql(final_sql)
                    return {"sql": final_sql, "prompt": current_context}
                
                elif "```sql" in ai_text:
                    # Final Answer found!
                    final_sql = cleanup_sql(ai_text)
                    return {"sql": final_sql, "prompt": current_context}
                
                else:
                    # No action, no SQL? Maybe it's just thinking or asking?
                    # Force it to conclude if it's chatting?
                    if turn == max_turns - 1:
                         current_context += "\nSystem: You are out of turns. Please output the best SQL you can now.\n"
            
            except Exception as e:
                logger.error(f"Agent Loop Error: {e}")
                break

    # Fallback to standard generation if no connection or loop failed
    if connection and 'current_context' in locals():
         history += f"\n\n[System: The agent attempted to solve this but failed. Here is the investigation log. Use this information to generate the correct SQL without hallucinating.]\n{current_context}\n"

    return standard_generate_sql(prompt, schema_context, schema_data, history, model, connection)

def standard_generate_sql(prompt, schema_context, schema_data, history, model, connection):
    # ... (Original Logic Renamed) ...
    # Initialize variables that were used in the original function
    logger.info("Fallback to Standard Generation")
    data_context = ""
    history_text = ""
    
    # ... (Copy essential parts of original build_prompt) ...
    def build_prompt(context_str, error_msg=None):
         # ... existing build_prompt code ...
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
            "CRITICAL: Do not assume column names based on your training data. You MUST strictly use the column names provided in the CREATE TABLE definitions above.\n"
            "CRITICAL: This database uses snake_case (e.g. `order_id`, `customer_name`). DO NOT use CamelCase (e.g. `OrderID`, `CustomerName`). If you use CamelCase, the query WILL FAIL.\n"
            "If a column is not in the schema, do not hallucinate it.\n"
            "DO NOT use backticks (`). Use double quotes (\") for identifiers if needed (e.g. \"Order Details\").\n\n"
            "### Output\n"
            "Return ONLY the SQL code block. No conversational text.\n"
            "```sql\n"
            "SELECT ...\n"
            "```"
        )
         if error_msg:
            base_prompt += f"\n\n!!! PREVIOUS ATTEMPT FAILED !!!\nError: {error_msg}\nFIX THE SQL AND RETURN ONLY THE FIXED SQL."
         return base_prompt

    # Retry Loop (Simplified for fallback)
    final_sql = None
    debug_prompt = build_prompt(schema_context)
    
    try:
        # One-shot attempt
        full_prompt = build_prompt(schema_context)
        payload = { "model": model, "prompt": full_prompt, "stream": False, "options": { "temperature": 0.2 } }
        response = requests.post(OLLAMA_URL, json=payload, timeout=120)
        response.raise_for_status()
        ai_response = response.json().get("response", "")
        
        final_sql = cleanup_sql(ai_response)
        
    except Exception as e:
        logger.error(f"Standard Gen Failed: {e}")

    return { "message": "", "sql": final_sql, "prompt": debug_prompt }

def cleanup_sql(text: str) -> str:
    """Robustly extract SQL from Markdown or raw text."""
    import re
    if not text: return ""
    # 1. Try ```sql ... ```
    match = re.search(r"```sql\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if match: return match.group(1).strip()
    
    # 2. Try ``` ... ```
    match = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
    if match: return match.group(1).strip()
    
    # 3. Fallback: Strip common artifacts
    text = text.replace("```sql", "").replace("```", "").strip()
    
    # 4. Remove leading "SELECT" if duplicated by accident? No, risky.
    return text


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
        "Focus ONLY on the logic present in the SQL. Do not infer unrelated entities (like Employees if not used).\n"
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

def repair_sql_query(sql: str, error: str, schema_context: str = None, schema_data: dict = None, model: str = "qwen2.5-coder") -> str:
    """
    Repairs a failed SQL query using the error message and schema.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

    print(f"DEBUG: Repair Schema Context:\n{schema_context}")

    # --- FUZZY MATCH LOGIC ---
    import re
    import difflib

    hint_msg = ""
    # Extract missing column from error (Handle optional quotes)
    col_match = re.search(r'column ["\']?(.*?)["\']? does not exist', error)
    if col_match and schema_data:
        missing_col = col_match.group(1)
        # Verify it's not just a table alias prefix like "c."
        if "." in missing_col:
             missing_col = missing_col.split(".")[-1]
             
        candidates = []
        
        for table_name, table_info in schema_data.items():
            # Handle list vs dict structure
            cols = table_info if isinstance(table_info, list) else table_info.get("columns", [])
            for col in cols:
                c_name = col['name']
                # Ratio > 0.6 or containment
                ratio = difflib.SequenceMatcher(None, missing_col, c_name).ratio()
                if ratio > 0.6 or (c_name in missing_col and len(c_name) > 3) or (missing_col in c_name and len(missing_col) > 3):
                        candidates.append(f"'{c_name}' (in table `{table_name}`)")
        
        if candidates:
            candidates = list(set(candidates))
            hint_msg = f"### AUTO-DETECTED HINT\nThe column '{missing_col}' was not found. Did you mean: {', '.join(candidates[:5])}?\nIF SO, REWRITE THE QUERY TO USE THE CORRECT COLUMN NAME AND JOIN THE TABLE."
        else:
            # Check for common calculated fields (Northwind specific but useful generally)
            COMMON_CALCS = {
                "total_amount": "SUM(od.unit_price * od.quantity * (1 - od.discount)) from `order_details` od",
                "total_price": "SUM(od.unit_price * od.quantity * (1 - od.discount)) from `order_details` od",
                "revenue": "SUM(od.unit_price * od.quantity * (1 - od.discount)) from `order_details` od",
                "sales": "SUM(od.unit_price * od.quantity * (1 - od.discount)) from `order_details` od",
                "profit": "SUM(od.unit_price * od.quantity * (1 - od.discount)) from `order_details` od",
            }
            if missing_col.lower() in COMMON_CALCS:
                 hint_msg = f"### AUTO-DETECTED HINT\nThe column '{missing_col}' does not exist. It is likely a calculated field. Try: {COMMON_CALCS[missing_col.lower()]}. Ensure you JOIN `order_details`."

    # PROACTIVE CHECK: Check if the SQL contains known "hallucination candidates" implies we should warn about them
    # Even if the current error is something else (or if we are fixing something else), 
    # if we see 'total_amount' in the problematic SQL, we should PROACTIVELY warn.
    COMMON_CALCS = {
        "total_amount": "SUM(od.unit_price * od.quantity * (1 - od.discount))",
        "total_price": "SUM(od.unit_price * od.quantity * (1 - od.discount))",
        "revenue": "SUM(od.unit_price * od.quantity * (1 - od.discount))",
    }
    for bad_col, calc in COMMON_CALCS.items():
        # Simple regex to see if bad_col is used as a column (not just text)
        # e.g. .total_amount or "total_amount" or total_amount
        if re.search(fr'(?i)\b{bad_col}\b', sql):
             # Only add if not already in hint
             if bad_col not in hint_msg:
                  hint_msg += f"\n\n### PROACTIVE HINT\nI see you used '{bad_col}'. This column does NOT exist. Replace it with: `{calc}` and ensure `order_details` is joined."

    # Relation (Table) mismatch logic
    rel_match = re.search(r'relation ["\']?(.*?)["\']? does not exist', error)
    if rel_match and schema_data:
        missing_rel = rel_match.group(1)
        candidates = []
        for table_name in schema_data.keys():
            # Check for case-insensitive match or high similarity
            if missing_rel.lower() == table_name.lower():
                 candidates.append(f"`{table_name}`")
            elif difflib.SequenceMatcher(None, missing_rel, table_name).ratio() > 0.6:
                 candidates.append(f"`{table_name}`")
        
        if candidates:
             candidates = list(set(candidates))
             hint_msg += f"\n\n### AUTO-DETECTED HINT\nThe table '{missing_rel}' was not found. Did you mean: {', '.join(candidates[:3])}?\nREPLACE the table name with the correct one from the schema."

    prompt = (
        f"You are a SQL Repair Expert. The user generated this SQL:\n```sql\n{sql}\n```\n"
        f"It failed with this error: {error}\n\n"
        f"{hint_msg}\n\n"
        "Task: Fix the SQL. Return ONLY the FIXED SQL code block.\n"
        "Constraint: Strictly use the Schema provided below. Do NOT use CamelCase if the schema is snake_case. Pay attention to table quoting and case sensitivity in PostgreSQL.\n"
        "CRITICAL DIAGNOSTIC:\n"
        "1. If the error is 'column does not exist', check if the column (or a similar one like `discount` instead of `discount_rate`) exists in ANOTHER table.\n"
        "2. If it exists in another table (e.g. `order_details`), you MUST ADD A JOIN to that table.\n"
        "3. Check for Case Sensitivity: `EmployeeID` vs `employee_id`.\n\n"
        "### Database Schema\n"
        f"{schema_context}\n\n"
        "### Output\n"
        "Return ONLY the FIXED SQL code block. No conversational text.\n"
    )

    logger.info(f"DEBUG: Repair Prompt Sent to AI:\n{prompt}")

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
        
        if "products" in sql.lower() and "category_name" in sql.lower():
             hint_msg += "\n\n### PROACTIVE HINT\nThe table `products` does NOT have `category_name`. It has `category_id`. You must JOIN `categories` to get `category_name`."

        # Extract SQL using Regex
        return cleanup_sql(ai_response)

    except Exception as e:
        logger.error(f"Failed to fix SQL: {e}")
        return sql # Return original if fix fails
