import psycopg2
from psycopg2 import sql
from app.models import ConnectionInfo

def get_distinct_values(info: ConnectionInfo, table: str, column: str, search: str = None, limit: int = 50, transform: str = None):
    """
    Fetches distinct values for a given table and column.
    If transform is provided (e.g., 'EXTRACT(YEAR FROM {})'), applies it to the column.
    """
    try:
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        
        # Build the column expression (with optional transform)
        if transform and '{}' in transform:
            # Replace {} with the quoted column identifier
            # We need to build this as raw SQL since transforms are complex expressions
            col_expr = transform.format(f'"{column}"')
        else:
            col_expr = f'"{column}"'
        
        # Build the query
        # Note: Using raw SQL for the transform expression since psycopg2.sql doesn't handle functions well
        if search:
            # Always cast to text for ILIKE comparison to handle non-string columns like DATE/INT
            query_str = f"SELECT DISTINCT {col_expr} FROM \"{table}\" WHERE {col_expr}::text ILIKE %s ORDER BY 1 LIMIT %s"
            cur.execute(query_str, (f"{search}%", limit))
        else:
            query_str = f"SELECT DISTINCT {col_expr} FROM \"{table}\" ORDER BY 1 LIMIT %s"
            cur.execute(query_str, (limit,))

        rows = cur.fetchall()
        
        # Convert values to strings for JSON serialization
        values = [str(row[0]) if row[0] is not None else None for row in rows]
        values = [v for v in values if v is not None]
        
        conn.close()
        return values
    except Exception as e:
        print(f"Error fetching distinct values: {e}")
        # Instead of failing hard (might be permissions or invalid table inferred by AI), return empty
        return []

def get_databases(info: ConnectionInfo):
    """
    Returns a list of all non-template databases on the server.
    """
    try:
        # Connect to 'postgres' database to list others
        dsn = f"host={info.host} port={info.port} dbname=postgres user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        
        cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
        rows = cur.fetchall()
        dbs = [row[0] for row in rows]
        
        conn.close()
        return dbs
    except Exception as e:
        print(f"Error listing databases: {e}")
        # Fallback: at least return the current one or empty
        return [info.database]
