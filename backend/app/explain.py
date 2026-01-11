import psycopg2
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
