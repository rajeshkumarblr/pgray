import psycopg2
from app.models import ConnectionInfo

def execute_explain(info: ConnectionInfo, query: str):
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
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
