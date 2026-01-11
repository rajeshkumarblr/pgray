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

def execute_explain(info: ConnectionInfo, query: str):
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        schema_name = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
        _set_search_path(conn, schema_name)

        cur = conn.cursor()
        
        # Run JSON Explain
        explain_query_json = f"EXPLAIN (FORMAT JSON, ANALYZE) {query}"
        cur.execute(explain_query_json)
        json_result = cur.fetchone()
        
        # Run Text Explain
        explain_query_text = f"EXPLAIN (FORMAT TEXT, ANALYZE) {query}"
        cur.execute(explain_query_text)
        text_result_lines = cur.fetchall() # Text explain returns multiple rows, each is a line
        text_plan = "\n".join([row[0] for row in text_result_lines])

        # Safer to ROLLBACK for EXPLAIN ANALYZE just in case user runs a modification query.
        conn.rollback() 
        conn.close()
        
        return {
            "json": json_result[0] if json_result else None,
            "text": text_plan
        }
    except Exception as e:
        print(f"Explain failed: {e}")
        raise e

def execute_query_results(info: ConnectionInfo, query: str, limit: int = 1000):
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        schema_name = getattr(info, 'schema_name', None) or getattr(info, 'schema', None) or 'public'
        _set_search_path(conn, schema_name)

        cur = conn.cursor()
        cur.execute(query)
        
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
                
            result = {
                "columns": columns,
                "rows": serialized_rows,
                "rowCount": len(rows),
                "isLimited": len(rows) == limit
            }
        else:
            result = {
                "columns": [],
                "rows": [],
                "rowCount": cur.rowcount,
                "message": "Query executed successfully (no rows returned)"
            }

        conn.rollback() # Read-only mode effectively
        conn.close()
        
        return result
    except Exception as e:
        print(f"Query execution failed: {e}")
        raise e
