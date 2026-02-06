import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import sql

logger = logging.getLogger(__name__)

SEARCH_INDEX_TABLE = "pgray_search_index"

def create_search_index(connection_info: dict, force_rebuild: bool = False) -> dict:
    """
    Creates a schema-only search index in 'pgray_search_index'.
    Scans distinct table and column names from information_schema.
    Does NOT scan actual table data.
    """
    conn = None
    try:
        conn = psycopg2.connect(**connection_info)
        conn.autocommit = True
        cur = conn.cursor()

        # 1. Setup Index Table
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
        except Exception as ext_err:
             logger.warning(f"Could not enable pg_trgm extension: {ext_err}. Fuzzy search may be limited.")
             conn.rollback() 
             cur = conn.cursor()

        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {SEARCH_INDEX_TABLE} (
                id SERIAL PRIMARY KEY,
                term TEXT NOT NULL,
                metadata JSONB,
                type TEXT NOT NULL,
                ts tsvector
            );
        """)
        
        # Indexes
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{SEARCH_INDEX_TABLE}_term ON {SEARCH_INDEX_TABLE} USING btree (term text_pattern_ops);")
        try:
             cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{SEARCH_INDEX_TABLE}_trgm ON {SEARCH_INDEX_TABLE} USING GIN (term gin_trgm_ops);")
        except:
             conn.rollback()
             cur = conn.cursor()
             logger.warning("Could not create GIN Trigram index.")

        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{SEARCH_INDEX_TABLE}_ts ON {SEARCH_INDEX_TABLE} USING GIN (ts);")
        
        if force_rebuild:
            cur.execute(f"TRUNCATE TABLE {SEARCH_INDEX_TABLE}")

        # 2. Scan Schema (Tables & Columns)
        # Fetch Tables
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = cur.fetchall()
        
        indexed_count = 0
        
        for (t_name,) in tables:
            # Index Table Name
            # Document: table_name 
            term = t_name
            meta = {"table": t_name, "type": "table"}
            
            cur.execute(f"""
                INSERT INTO {SEARCH_INDEX_TABLE} (term, metadata, type, ts)
                VALUES (%s, %s, 'table', to_tsvector('english', %s))
                ON CONFLICT DO NOTHING
            """, (term, psycopg2.extras.Json(meta), term))
            indexed_count += 1
            
            # Fetch Columns for this table
            cur.execute("""
                SELECT column_name, data_type
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = %s
            """, (t_name,))
            columns = cur.fetchall()
            
            for (c_name, d_type) in columns:
                # Index Column
                # Document: table_name column_name data_type
                term = f"{t_name} {c_name} {d_type}"
                meta = {"table": t_name, "column": c_name, "type": "column"}
                
                cur.execute(f"""
                    INSERT INTO {SEARCH_INDEX_TABLE} (term, metadata, type, ts)
                    VALUES (%s, %s, 'column', to_tsvector('english', %s))
                    ON CONFLICT DO NOTHING
                """, (term, psycopg2.extras.Json(meta), term))
                indexed_count += 1

        logger.info(f"Schema Indexing complete. Added {indexed_count} entries.")
        return {"status": "success", "indexed_entries": indexed_count}

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()

def search_similiar(connection_info: dict, query_term: str, limit: int = 5) -> list:
    """
    Searches the schema index.
    Returns list of matches.
    """
    conn = None
    try:
        conn = psycopg2.connect(**connection_info)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            # Fuzzy match
            sql = f"""
                SELECT term, metadata, type,
                       similarity(term, %s) as score
                FROM {SEARCH_INDEX_TABLE}
                WHERE term %% %s
                   OR term ILIKE %s
                ORDER BY score DESC, term ASC
                LIMIT %s
            """
            like_term = f"%{query_term}%"
            cur.execute(sql, (query_term, query_term, like_term, limit))
            results = cur.fetchall()
            return results
        except Exception:
             conn.rollback()
             cur = conn.cursor(cursor_factory=RealDictCursor)
             # Fallback
             sql = f"""
                SELECT term, metadata, type, 0 as score
                FROM {SEARCH_INDEX_TABLE}
                WHERE term ILIKE %s
                LIMIT %s
            """
             like_term = f"%{query_term}%"
             cur.execute(sql, (like_term, limit))
             return cur.fetchall()

    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []
    finally:
        if conn:
            conn.close()

# Alias for backward compatibility
search_database = search_similiar

def autocomplete_entity(connection_info: dict, term: str, table: str = None) -> list:
    """
    Performs prefix search on schema metadata.
    """
    conn = None
    try:
        conn = psycopg2.connect(**connection_info)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        results = []
        
        # Search Tables
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name ILIKE %s 
            LIMIT 5
        """, (f"{term}%",))
        rows = cur.fetchall()
        results.extend([{"value": r['table_name'], "meta": "Table", "type": "table"} for r in rows])
        
        # Search Columns
        cur.execute("""
             SELECT column_name, table_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND column_name ILIKE %s
             LIMIT 5
        """, (f"{term}%",))
        c_rows = cur.fetchall()
        results.extend([{"value": r['column_name'], "meta": f"Column ({r['table_name']})", "type": "column"} for r in c_rows])

        return results

    except Exception as e:
        logger.error(f"Autocomplete failed: {e}")
        return []
    finally:
        if conn:
            conn.close()
