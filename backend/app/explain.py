import psycopg2
import datetime
from decimal import Decimal
from psycopg2 import sql
from app.models import ConnectionInfo


def _set_search_path(conn, schema_name: str):
    schema_name = (schema_name or 'public').strip() or 'public'
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL('SET search_path TO {}, {}').format(
                sql.Identifier(schema_name),
                sql.Identifier('public'),
            )
        )

def execute_explain(info: ConnectionInfo, query: str, analyze: bool = True):
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        schema_name = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
        _set_search_path(conn, schema_name)

        cur = conn.cursor()
        
        # Build commands
        options = "ANALYZE" if analyze else ""
        # Note: FORMAT JSON is always required for the visualizer
        if analyze:
            explain_json_cmd = f"EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) {query}"
        else:
            explain_json_cmd = f"EXPLAIN (FORMAT JSON) {query}"
        explain_text_cmd = f"EXPLAIN (FORMAT TEXT, {options}) {query}" if analyze else f"EXPLAIN (FORMAT TEXT) {query}"

        # Run JSON Explain
        cur.execute(explain_json_cmd)
        json_result = cur.fetchone()
        
        # Run Text Explain
        cur.execute(explain_text_cmd)
        text_result_lines = cur.fetchall()
        text_plan = "\n".join([row[0] for row in text_result_lines])

        conn.rollback() 
        conn.close()
        
        return {
            "json": json_result[0] if json_result else None,
            "text": text_plan
        }
    except Exception as e:
        print(f"Explain failed: {e}")
        raise e

def execute_query_results(info: ConnectionInfo, query: str, limit: int = 1000, params: dict = None):
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        schema_name = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
        _set_search_path(conn, schema_name)

        cur = conn.cursor()
        import time
        start_time = time.time()
        
        # Convert :param style to %(param)s style for psycopg2
        # This is simple regex replacement, might need robustness for strings containing :
        import re
        if params:
             # Look for :word boundaries. 
             # Be careful not to replace things inside strings, but for now a simple regex is a good start for this use case.
             # Better way: Let the frontend send $1 or let's assume the user uses :param.
             # Psycopg2 uses %(name)s for dict parameters.
             # We replace :name with %(name)s
             for key in params.keys():
                  # Replace :key with %(key)s, ensuring word boundary
                  pattern = r'(?<!\w):' + re.escape(key) + r'\b'
                  query = re.sub(pattern, f'%({key})s', query)

        cur.execute(query, params)
        
        # Check if query returns rows
        if cur.description:
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchmany(limit)
            
            # Serialize special types
            serialized_rows = []
            for row in rows:
                serialized_row = []
                for item in row:
                    if isinstance(item, (datetime.date, datetime.datetime)):
                        serialized_row.append(item.isoformat())
                    elif isinstance(item, Decimal):
                        serialized_row.append(float(item))
                    else:
                        serialized_row.append(item)
                serialized_rows.append(serialized_row)
            
            end_time = time.time()
            execution_time_ms = (end_time - start_time) * 1000
                
            result = {
                "columns": columns,
                "rows": serialized_rows,
                "rowCount": len(rows),
                "isLimited": len(rows) == limit,
                "executionTime": round(execution_time_ms, 2)
            }
        else:
            end_time = time.time()
            execution_time_ms = (end_time - start_time) * 1000
            
            result = {
                "columns": [],
                "rows": [],
                "rowCount": cur.rowcount,
                "message": "Query executed successfully (no rows returned)",
                "executionTime": round(execution_time_ms, 2)
            }

        conn.rollback() # Read-only mode effectively
        conn.close()
        
        return result
    except Exception as e:
        print(f"Query execution failed: {e}")
        raise e

def get_schema_tree(info: ConnectionInfo):
    """
    Returns a hierarchical view of tables, columns, and indexes for the selected schema.
    Returns: { 
      "table_name": {
        "columns": [ { "name": "...", "type": "..." } ],
        "indexes": [ { "name": "...", "def": "..." } ]
      } 
    }
    """
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
        
        target_schema = getattr(info, 'schema_name', None) or 'public'
        
        cur = conn.cursor()
        
        # 1. Fetch Columns
        col_query = """
            SELECT 
                table_name, 
                column_name, 
                data_type
            FROM information_schema.columns
            WHERE table_schema = %s
            ORDER BY table_name, ordinal_position;
        """
        cur.execute(col_query, (target_schema,))
        col_rows = cur.fetchall()
        
        # 2. Fetch Indexes
        # pg_indexes provides a convenient view: tablename, indexname, indexdef
        idx_query = """
            SELECT 
                tablename, 
                indexname, 
                indexdef
            FROM pg_indexes
            WHERE schemaname = %s
            ORDER BY tablename, indexname;
        """
        cur.execute(idx_query, (target_schema,))
        idx_rows = cur.fetchall()
        
        # Transform into tree
        schema_tree = {}
        
        # Process Columns
        for row in col_rows:
            table = row[0]
            col_name = row[1]
            data_type = row[2]
            
            if table not in schema_tree:
                schema_tree[table] = { "columns": [], "indexes": [], "fks": [] }
                
            schema_tree[table]["columns"].append({
                "name": col_name,
                "type": data_type
            })

        # Process Indexes
        for row in idx_rows:
            table = row[0]
            idx_name = row[1]
            idx_def = row[2]
            
            # Independent check in case a table has indexes but no columns (unlikely but safe)
            if table not in schema_tree:
                schema_tree[table] = { "columns": [], "indexes": [], "fks": [] }

            schema_tree[table]["indexes"].append({
                "name": idx_name,
                "def": idx_def
            })
            
        # 3. Fetch Foreign Keys
        fk_query = """
            SELECT
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM
                information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = %s;
        """
        cur.execute(fk_query, (target_schema,))
        fk_rows = cur.fetchall()

        for row in fk_rows:
            table = row[0]
            if table in schema_tree:
                schema_tree[table]["fks"].append({
                    "column": row[1],
                    "foreign_table": row[2],
                    "foreign_column": row[3]
                })
            
        conn.close()

        # 4. Heuristic Foreign Keys (Soft FKs)
        # If no explicit FK exists, infer from column naming (e.g., job_id -> jobs.id)
        for table, data in schema_tree.items():
            existing_fks = {fk['column'] for fk in data['fks']}
            for col in data['columns']:
                col_name = col['name']
                if col_name.endswith('_id') and col_name not in existing_fks:
                    # heuristic: job_id -> jobs / job
                    base = col_name[:-3] # 'job'
                    candidates = [base, base + 's'] # 'job', 'jobs'
                    
                    for target in candidates:
                        if target in schema_tree and target != table:
                            # Check if target has 'id'
                            target_cols = [c['name'] for c in schema_tree[target]['columns']]
                            if 'id' in target_cols:
                                data['fks'].append({
                                    "column": col_name,
                                    "foreign_table": target,
                                    "foreign_column": "id",
                                })
                                break # Match found

        return schema_tree
        
    except Exception as e:
        print(f"Schema fetch failed: {e}")
        raise e

def get_pg_settings(info: ConnectionInfo):
    """
    Returns a dictionary of postgres settings (name, setting, unit, category, short_desc).
    """
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        
        # Query sensitive pg_settings view
        query = """
            SELECT name, setting, unit, category, short_desc
            FROM pg_settings
            ORDER BY category, name;
        """
        
        cur.execute(query)
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        results = []
        for row in rows:
            results.append(dict(zip(columns, row)))
            
        conn.close()
        return results
        
    except Exception as e:
        print(f"Settings fetch failed: {e}")
        # Return empty list on failure (e.g. permission denied) rather than crashing
        # or re-raise if we want to handle it in the endpoint
        raise e

