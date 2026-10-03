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

def _prepare_query_params(query: str, params: dict):
    """
    Convert :param style to %(param)s style for psycopg2
    """
    import re
    if params:
         for key in params.keys():
              # Replace :key with %(key)s, ensuring word boundary
              pattern = r'(?<!\w):' + re.escape(key) + r'\b'
              query = re.sub(pattern, f'%({key})s', query)
    return query

def execute_explain(info: ConnectionInfo, query: str, analyze: bool = True, params: dict = None):
    try:
        # Normalize connection info (handle dict vs object)
        if isinstance(info, dict):
            host = info.get('host')
            port = info.get('port')
            database = info.get('database')
            username = info.get('username')
            password = info.get('password')
            schema = info.get('schema_name') or info.get('schema') or 'public'
        else:
            host = info.host
            port = info.port
            database = info.database
            username = info.username
            password = info.password
            schema = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'

        dsn = f"host={host} port={port} dbname={database} user={username} password={password} connect_timeout=10"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        _set_search_path(conn, schema)

        cur = conn.cursor()
        
        # Prepare query with params
        query = _prepare_query_params(query, params)
        
        # Build commands
        options = "ANALYZE" if analyze else ""
        # Note: FORMAT JSON is always required for the visualizer
        if analyze:
            explain_json_cmd = f"EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) {query}"
        else:
            explain_json_cmd = f"EXPLAIN (FORMAT JSON) {query}"
        explain_text_cmd = f"EXPLAIN (FORMAT TEXT, {options}) {query}" if analyze else f"EXPLAIN (FORMAT TEXT) {query}"

        # Run JSON Explain
        cur.execute(explain_json_cmd, params)
        json_result = cur.fetchone()
        
        # Run Text Explain
        cur.execute(explain_text_cmd, params)
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
        if isinstance(info, dict):
            # Map dict keys (user/username mapping might be needed)
            # app/models.py ConnectionRequest uses 'user' usually? 
            # ConnectionInfo uses 'username'.
            # backend/app/ai.py passes request.connection.model_dump().
            # model_dump() uses field names: host, port, database, username, password.
            # Wait, verify ConnectionInfo model fields.
            host = info.get('host')
            port = info.get('port')
            database = info.get('database')
            username = info.get('username') or info.get('user')
            password = info.get('password')
        else:
            host = info.host
            port = info.port
            database = info.database
            username = info.username
            password = info.password
            
        dsn = f"host={host} port={port} dbname={database} user={username} password={password} connect_timeout=10"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        schema_name = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
        _set_search_path(conn, schema_name)

        cur = conn.cursor()
        import time
        start_time = time.time()
        
        query = _prepare_query_params(query, params)

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
        if isinstance(info, dict):
            # Support both 'user' (alias) and 'username' (field name)
            user = info.get('user') or info.get('username')
            dsn = f"host={info.get('host')} port={info.get('port')} dbname={info.get('database')} user={user} password={info.get('password')}"
            target_schema = info.get('schema_name') or info.get('schema') or 'public'
        else:
            dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
            target_schema = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
            
        conn = psycopg2.connect(dsn)
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

def get_schema_for_table(info: ConnectionInfo, table_name: str):
    """
    Returns the schema definition (columns, fks) for a single table.
    Reuses get_schema_tree for consistency.
    """
    try:
        full_schema = get_schema_tree(info)
        return full_schema.get(table_name)
    except Exception as e:
        print(f"Error fetching schema for {table_name}: {e}")
        return None

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


def _extract_dsn_and_schema(info):
    if isinstance(info, dict):
        host = info.get('host')
        port = info.get('port')
        database = info.get('database')
        username = info.get('username') or info.get('user')
        password = info.get('password')
        schema = info.get('schema_name') or info.get('schema') or 'public'
    else:
        host = info.host
        port = info.port
        database = info.database
        username = info.username
        password = info.password
        schema = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
    dsn = f"host={host} port={port} dbname={database} user={username} password={password} connect_timeout=10"
    return dsn, (schema or 'public').strip() or 'public'


def simulate_index_explain(info: ConnectionInfo, query: str, index_sql: str, analyze: bool = True):
    """
    Runs a transactional What-If Index Simulation:
    1. Baseline EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS)
    2. BEGIN -> CREATE INDEX -> ANALYZE <table> -> Simulated EXPLAIN -> ROLLBACK
    """
    import re
    dsn, schema = _extract_dsn_and_schema(info)
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    try:
        _set_search_path(conn, schema)
        cur = conn.cursor()

        clean_query = query.strip().rstrip(';')
        explain_opts = "FORMAT JSON, ANALYZE, BUFFERS" if analyze else "FORMAT JSON"
        explain_text_opts = "FORMAT TEXT, ANALYZE, BUFFERS" if analyze else "FORMAT TEXT"

        # 1. Baseline Plan
        cur.execute(f"EXPLAIN ({explain_opts}) {clean_query}")
        base_json_row = cur.fetchone()
        base_json = base_json_row[0] if base_json_row else None

        cur.execute(f"EXPLAIN ({explain_text_opts}) {clean_query}")
        base_text = "\n".join([r[0] for r in cur.fetchall()])

        # Reset transaction before starting simulation block
        conn.rollback()
        _set_search_path(conn, schema)

        # 2. Prepare Index DDL (strip CONCURRENTLY so it can run inside a transaction block)
        sim_index_sql = re.sub(r'\bCONCURRENTLY\b', '', index_sql, flags=re.IGNORECASE).strip()
        if not re.match(r'^\s*CREATE\s+(UNIQUE\s+)?INDEX\b', sim_index_sql, flags=re.IGNORECASE):
            raise ValueError("Only CREATE INDEX statements can be simulated.")

        cur.execute(sim_index_sql)

        # Extract table name from ON <table_name> to run ANALYZE so planner stats update immediately
        tbl_match = re.search(r'\bON\s+(?:ONLY\s+)?([a-zA-Z0-9_."]+)', sim_index_sql, flags=re.IGNORECASE)
        if tbl_match:
            raw_tbl = tbl_match.group(1).strip('"').split('.')[-1]
            try:
                cur.execute(sql.SQL("ANALYZE {}").format(sql.Identifier(raw_tbl)))
            except Exception:
                pass

        # 3. Simulated Plan
        cur.execute(f"EXPLAIN ({explain_opts}) {clean_query}")
        sim_json_row = cur.fetchone()
        sim_json = sim_json_row[0] if sim_json_row else None

        cur.execute(f"EXPLAIN ({explain_text_opts}) {clean_query}")
        sim_text = "\n".join([r[0] for r in cur.fetchall()])

        # Always roll back the simulated index
        conn.rollback()

        def _extract_metrics(plan_json):
            if not plan_json or not isinstance(plan_json, list) or len(plan_json) == 0:
                return 0.0, 0.0
            root = plan_json[0]
            plan = root.get("Plan", {})
            total_cost = float(plan.get("Total Cost", 0.0) or 0.0)
            exec_ms = float(root.get("Execution Time", plan.get("Actual Total Time", 0.0)) or 0.0)
            return total_cost, exec_ms

        base_cost, base_ms = _extract_metrics(base_json)
        sim_cost, sim_ms = _extract_metrics(sim_json)

        cost_reduction_pct = round(((base_cost - sim_cost) / base_cost) * 100.0, 1) if base_cost > 0 else 0.0
        time_reduction_pct = round(((base_ms - sim_ms) / base_ms) * 100.0, 1) if base_ms > 0 else 0.0

        return {
            "baseline_json": base_json,
            "baseline_text": base_text,
            "baseline_cost": round(base_cost, 2),
            "baseline_exec_ms": round(base_ms, 3),
            "simulated_json": sim_json,
            "simulated_text": sim_text,
            "simulated_cost": round(sim_cost, 2),
            "simulated_exec_ms": round(sim_ms, 3),
            "cost_reduction_pct": cost_reduction_pct,
            "time_reduction_pct": time_reduction_pct,
            "index_sql": index_sql.strip(),
        }
    finally:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()


def get_admin_diagnostics(info: ConnectionInfo):
    """
    Collects comprehensive PostgreSQL DBA & developer diagnostics:
    - missing_fk_indexes: Foreign key columns lacking a supporting index
    - unused_indexes: Non-PK/Non-Unique indexes with idx_scan = 0
    - table_stats: Sequential scan vs index scan ratios, dead tuple bloat %, sizes, last analyze/vacuum
    - active_sessions: Live pg_stat_activity + pg_blocking_pids lock tree
    - slow_queries: Top queries from pg_stat_statements (if extension enabled)
    """
    dsn, schema = _extract_dsn_and_schema(info)
    conn = psycopg2.connect(dsn)
    try:
        cur = conn.cursor()

        # 1. Missing FK Indexes
        missing_fk_query = """
            WITH fk_constraints AS (
                SELECT
                    con.conname AS constraint_name,
                    rel.relname AS table_name,
                    att.attname AS column_name,
                    frel.relname AS foreign_table,
                    con.conrelid,
                    con.conkey[1] AS attnum,
                     COALESCE(stat.n_live_tup, rel.reltuples::bigint, 0) AS est_rows
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                JOIN pg_class frel ON frel.oid = con.confrelid
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
                LEFT JOIN pg_stat_user_tables stat ON stat.relid = con.conrelid
                WHERE con.contype = 'f'
                  AND nsp.nspname = %s
                  AND array_length(con.conkey, 1) = 1
            )
            SELECT
                fk.table_name,
                fk.column_name,
                fk.foreign_table,
                fk.constraint_name,
                fk.est_rows
            FROM fk_constraints fk
            WHERE NOT EXISTS (
                SELECT 1
                FROM pg_index idx
                WHERE idx.indrelid = fk.conrelid
                  AND idx.indkey[0] = fk.attnum
            )
            ORDER BY fk.est_rows DESC, fk.table_name, fk.column_name;
        """
        cur.execute(missing_fk_query, (schema,))
        missing_fk_indexes = []
        for row in cur.fetchall():
            t_name, c_name, f_table, con_name, est_rows = row
            idx_name = f"idx_{t_name}_{c_name}"
            missing_fk_indexes.append({
                "table_name": t_name,
                "column_name": c_name,
                "foreign_table": f_table,
                "constraint_name": con_name,
                "est_rows": int(est_rows or 0),
                "suggested_sql": f"CREATE INDEX {idx_name} ON {t_name} ({c_name});"
            })

        # 2. Unused Indexes
        unused_idx_query = """
            SELECT
                s.relname AS table_name,
                s.indexrelname AS index_name,
                s.idx_scan,
                pg_relation_size(s.indexrelid) AS size_bytes,
                pg_size_pretty(pg_relation_size(s.indexrelid)) AS size_pretty,
                pg_get_indexdef(s.indexrelid) AS indexdef
            FROM pg_stat_user_indexes s
            JOIN pg_index i ON i.indexrelid = s.indexrelid
            WHERE s.schemaname = %s
              AND NOT i.indisprimary
              AND NOT i.indisunique
              AND s.idx_scan = 0
            ORDER BY pg_relation_size(s.indexrelid) DESC, s.relname;
        """
        cur.execute(unused_idx_query, (schema,))
        unused_indexes = []
        for row in cur.fetchall():
            unused_indexes.append({
                "table_name": row[0],
                "index_name": row[1],
                "idx_scan": int(row[2] or 0),
                "size_bytes": int(row[3] or 0),
                "size_pretty": row[4],
                "indexdef": row[5]
            })

        # 3. Table Health & Sequential Scan Hotspots
        table_stats_query = """
            SELECT
                relname AS table_name,
                COALESCE(seq_scan, 0) AS seq_scan,
                COALESCE(seq_tup_read, 0) AS seq_tup_read,
                COALESCE(idx_scan, 0) AS idx_scan,
                COALESCE(idx_tup_fetch, 0) AS idx_tup_fetch,
                COALESCE(n_live_tup, 0) AS n_live_tup,
                COALESCE(n_dead_tup, 0) AS n_dead_tup,
                ROUND(100.0 * COALESCE(n_dead_tup, 0) / GREATEST(COALESCE(n_live_tup, 0) + COALESCE(n_dead_tup, 0), 1), 1) AS dead_tup_pct,
                pg_total_relation_size(relid) AS size_bytes,
                pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                COALESCE(last_analyze, last_autoanalyze) AS last_analyzed,
                COALESCE(last_vacuum, last_autovacuum) AS last_vacuumed
            FROM pg_stat_user_tables
            WHERE schemaname = %s
            ORDER BY COALESCE(seq_tup_read, 0) DESC, pg_total_relation_size(relid) DESC;
        """
        cur.execute(table_stats_query, (schema,))
        table_stats = []
        for row in cur.fetchall():
            table_stats.append({
                "table_name": row[0],
                "seq_scan": int(row[1] or 0),
                "seq_tup_read": int(row[2] or 0),
                "idx_scan": int(row[3] or 0),
                "idx_tup_fetch": int(row[4] or 0),
                "n_live_tup": int(row[5] or 0),
                "n_dead_tup": int(row[6] or 0),
                "dead_tup_pct": float(row[7] or 0.0),
                "size_bytes": int(row[8] or 0),
                "total_size": row[9],
                "last_analyzed": row[10].isoformat() if row[10] else None,
                "last_vacuumed": row[11].isoformat() if row[11] else None,
            })

        # 4. Active Sessions & Lock Tree
        sessions_query = """
            SELECT
                pid,
                usename,
                application_name,
                COALESCE(client_addr::text, 'local') AS client_addr,
                state,
                wait_event_type,
                wait_event,
                ROUND(EXTRACT(EPOCH FROM (now() - query_start))::numeric, 2) AS duration_sec,
                pg_blocking_pids(pid) AS blocking_pids,
                LEFT(query, 600) AS query
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND state IS NOT NULL
            ORDER BY
                CASE WHEN state = 'active' THEN 0 WHEN state LIKE 'idle in transaction%' THEN 1 ELSE 2 END,
                duration_sec DESC NULLS LAST;
        """
        cur.execute(sessions_query)
        active_sessions = []
        for row in cur.fetchall():
            active_sessions.append({
                "pid": int(row[0]),
                "usename": row[1] or "",
                "application_name": row[2] or "",
                "client_addr": row[3] or "local",
                "state": row[4] or "",
                "wait_event_type": row[5],
                "wait_event": row[6],
                "duration_sec": float(row[7] or 0.0),
                "blocking_pids": list(row[8]) if row[8] else [],
                "query": row[9] or "",
            })

        # 5. Top Slow Queries (pg_stat_statements if installed)
        pg_stat_statements_enabled = False
        slow_queries = []
        try:
            cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';")
            if cur.fetchone():
                pg_stat_statements_enabled = True
                cur.execute("""
                    SELECT
                        LEFT(query, 800) AS query,
                        calls,
                        ROUND(total_exec_time::numeric, 2) AS total_ms,
                        ROUND(mean_exec_time::numeric, 2) AS mean_ms,
                        rows,
                        shared_blks_hit,
                        shared_blks_read
                    FROM pg_stat_statements
                    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                      AND query NOT ILIKE '%%pg_stat_%%'
                      AND query NOT ILIKE 'EXPLAIN%%'
                    ORDER BY mean_exec_time DESC
                    LIMIT 20;
                """)
                for row in cur.fetchall():
                    slow_queries.append({
                        "query": row[0],
                        "calls": int(row[1] or 0),
                        "total_ms": float(row[2] or 0.0),
                        "mean_ms": float(row[3] or 0.0),
                        "rows": int(row[4] or 0),
                        "shared_blks_hit": int(row[5] or 0),
                        "shared_blks_read": int(row[6] or 0),
                    })
        except Exception:
            conn.rollback()

        return {
            "missing_fk_indexes": missing_fk_indexes,
            "unused_indexes": unused_indexes,
            "table_stats": table_stats,
            "active_sessions": active_sessions,
            "pg_stat_statements_enabled": pg_stat_statements_enabled,
            "slow_queries": slow_queries,
        }
    finally:
        conn.close()


def run_admin_action(info: ConnectionInfo, action: str, target: str = "", sql_command: str = ""):
    """
    Executes an administrative/tuning action with autocommit=True:
    - analyze: ANALYZE <target>
    - vacuum_analyze: VACUUM ANALYZE <target>
    - create_index: executes CREATE [UNIQUE] INDEX ...
    - cancel_backend: SELECT pg_cancel_backend(<pid>)
    - enable_pg_stat_statements: CREATE EXTENSION IF NOT EXISTS pg_stat_statements
    """
    import re
    dsn, schema = _extract_dsn_and_schema(info)
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        _set_search_path(conn, schema)
        cur = conn.cursor()

        if action == "analyze":
            if not target:
                raise ValueError("Target table name is required for ANALYZE.")
            cur.execute(sql.SQL("ANALYZE {}").format(sql.Identifier(target)))
            return {"status": "success", "message": f"ANALYZE {target} completed."}

        elif action == "vacuum_analyze":
            if not target:
                raise ValueError("Target table name is required for VACUUM ANALYZE.")
            cur.execute(sql.SQL("VACUUM ANALYZE {}").format(sql.Identifier(target)))
            return {"status": "success", "message": f"VACUUM ANALYZE {target} completed."}

        elif action == "create_index":
            cmd = (sql_command or "").strip()
            if not re.match(r'^\s*CREATE\s+(UNIQUE\s+)?INDEX\b', cmd, flags=re.IGNORECASE):
                raise ValueError("Only CREATE INDEX statements are allowed.")
            cur.execute(cmd)
            return {"status": "success", "message": "Index created successfully."}

        elif action == "cancel_backend":
            pid = int(target)
            cur.execute("SELECT pg_cancel_backend(%s);", (pid,))
            cancelled = cur.fetchone()[0]
            return {
                "status": "success" if cancelled else "warning",
                "message": f"Sent cancel signal to PID {pid}." if cancelled else f"Could not cancel PID {pid}."
            }

        elif action == "enable_pg_stat_statements":
            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;")
            return {"status": "success", "message": "pg_stat_statements extension enabled."}

        else:
            raise ValueError(f"Unsupported admin action: {action}")
    finally:
        conn.close()


