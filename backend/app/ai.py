import logging
import requests
import httpx # Async Support
import json
import datetime

import os

logging.basicConfig(level=logging.INFO)
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
        response = requests.post(OLLAMA_URL, json=payload, timeout=300)
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

async def generate_sql_stream(prompt: str, schema_context: str = None, schema_data: dict = None, history: list = None, model: str = "qwen2.5-coder", plan_text: str = None, sql_query: str = None):
    """
    Async Generator that streams the response from Ollama using httpx.
    """
    if schema_data:
        schema_context = format_schema_ddl(schema_data)
    elif not schema_context:
        schema_context = "-- No schema provided"

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
            f"{schema_context}\n\n"
            f"{optimization_context}"
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
            f"{schema_context}\n\n"
            f"{optimization_context}"
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
            "7. Output ONLY the SQL code block. Do NOT include any explanations, introductions, or 'Here is the SQL'.\n"
        )


    payload = {
        "model": model, 
        "prompt": base_prompt,
        "stream": True,  # ENABLE STREAMING
        "options": { "temperature": 0.1 } # Lower temperature for diffs
    }

    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", OLLAMA_URL, json=payload, timeout=300) as response:
                response.raise_for_status()
                full_response = ""
                async for line in response.aiter_lines():
                    if line:
                        body = json.loads(line)
                        token = body.get("response", "")
                        if token:
                            full_response += token
                            yield token
                logger.info(f"✅ Generated Stream:\n{full_response}")
    except Exception as e:
        logger.error(f"Stream failed: {e}")
        yield f"\n-- Error: {str(e)}"


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

async def analyze_parameterized_query(sql_query: str, model: str = "qwen2.5-coder") -> dict:
    """
    Analyzes SQL to propose a Title and potential Parameters.
    Returns:
    {
      "title": "...",
      "parameters": [
         { "name": "actor_name", "original_value": "'Tom Hanks'" },
         ...
      ]
    }
    """
    prompt = (
        "You are an expert SQL Assistant.\n"
        "1. Analyze the given SQL query.\n"
        "2. Suggest a short, descriptive Title (3-5 words).\n"
        "3. Identify ALL literal values (strings, numbers) in WHERE/JAVING clauses that could be parameters.\n"
        "4. For each, propose a parameter name (e.g. :actor_name) and extraction the original value.\n"
        "5. Output valid JSON.\n\n"
        f"Input SQL:\n```sql\n{sql_query}\n```\n\n"
        "Output Format:\n"
        "{\n"
        "  \"title\": \"Movies by Actor\",\n"
        "  \"parameters\": [\n"
        "    { \"name\": \"actor_name\", \"original_value\": \"'Tom Hanks'\" },\n"
        "    { \"name\": \"min_year\", \"original_value\": \"2000\" }\n"
        "  ]\n"
        "}"
    )
    
    payload = {
        "model": model, 
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": { "temperature": 0.1 }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OLLAMA_URL, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            content = data.get("response", "")
            
            try:
                import json
                result = json.loads(content)
                # Ensure structure
                if "title" not in result: result["title"] = "Untitled Query"
                if "parameters" not in result: result["parameters"] = []
                # Fix up parameters if they are just strings (handling loose AI response)
                fixed_params = []
                for p in result["parameters"]:
                    if isinstance(p, dict) and "name" in p and "original_value" in p:
                        fixed_params.append(p)
                result["parameters"] = fixed_params
                return result
            except json.JSONDecodeError:
                 return { "title": "Untitled Query", "parameters": [] }
                 
    except Exception as e:
        logger.error(f"Analyze Query failed: {e}")
        return { "title": "Error Analyzing", "parameters": [], "error": str(e) }
