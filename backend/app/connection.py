import psycopg2
from app.models import ConnectionInfo

def test_connection(info: ConnectionInfo) -> bool:
    try:
        # Construct DSN
        dsn = f"host={info.host} port={info.port} dbname={info.database} user={info.username} password={info.password}"
        conn = psycopg2.connect(dsn)
        conn.close()
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        raise e
