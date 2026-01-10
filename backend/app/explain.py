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
        
        # Determine if we can run JSON format, usually yes for Postgres
        explain_query = f"EXPLAIN (FORMAT JSON, ANALYZE) {query}"
        
        cur.execute(explain_query)
        result = cur.fetchone()
        
        conn.commit() # Good practice even for reads to release locks in some transactional modes, though explain usually doesn't need it. 
        # But wait, EXPLAIN ANALYZE actually runs the query. If it's a DELETE/UPDATE, we might want to rollback.
        # Safer to ROLLBACK for EXPLAIN ANALYZE just in case user runs a modification query.
        conn.rollback() 
        conn.close()
        
        if result:
            return result[0] # Returns the JSON object
        return None
    except Exception as e:
        print(f"Explain failed: {e}")
        raise e
