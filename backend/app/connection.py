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

def test_connection(info: ConnectionInfo) -> bool:
    try:
        # Construct DSN
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)

        # Ensure unqualified table names resolve in the selected schema
        _set_search_path(conn, getattr(info, 'schema', 'public'))

        conn.close()
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        raise e
