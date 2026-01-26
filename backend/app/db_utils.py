import psycopg2
from psycopg2 import sql
from app.models import ConnectionInfo

def get_distinct_values(info: ConnectionInfo, table: str, column: str, search: str = None, limit: int = 50):
    """
    Fetches distinct values for a given table and column.
    """
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        
        # Safe Identifier Construction
        if search:
            query = sql.SQL("SELECT DISTINCT {} FROM {} WHERE {} ILIKE %s ORDER BY {} LIMIT %s").format(
                sql.Identifier(column),
                sql.Identifier(table),
                sql.Identifier(column),
                sql.Identifier(column)
            )
            cur.execute(query, (f"%{search}%", limit))
        else:
            query = sql.SQL("SELECT DISTINCT {} FROM {} ORDER BY {} LIMIT %s").format(
                sql.Identifier(column),
                sql.Identifier(table),
                sql.Identifier(column)
            )
            cur.execute(query, (limit,))

        rows = cur.fetchall()
        
        values = [row[0] for row in rows if row[0] is not None]
        
        conn.close()
        return values
    except Exception as e:
        print(f"Error fetching distinct values: {e}")
        # Instead of failing hard (might be permissions or invalid table inferred by AI), return empty
        return []
