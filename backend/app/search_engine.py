import logging
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

SEARCH_INDEX_TABLE = "pgray_search_index"

def create_search_index(connection_info: dict, force_rebuild: bool = False) -> dict:
    """
    Scans the database for text columns and creates a lightweight inverted index
    in a dedicated table 'pgray_search_index'.
    
    Returns a summary of indexed items.
    """
    conn = None
    try:
        # 1. Connect to DB
        conn = psycopg2.connect(**connection_info)
        conn.autocommit = True
        cur = conn.cursor()

        # 2. Check/Create Index Table
        # We store: term (token), original_value, table, column, id_value
        # Using a simple setup for now. 
        # For efficiency, we might just store `term` and `loc` (table:col:id)
        
        # Enable pg_trgm for fuzzy search (try/except in case of permissions)
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
        except Exception as ext_err:
             logger.warning(f"Could not enable pg_trgm extension: {ext_err}. Fuzzy search may be limited.")
             conn.rollback() # Rollback the failed extension creation
             # Start new transaction
             cur = conn.cursor()

        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {SEARCH_INDEX_TABLE} (
                id SERIAL PRIMARY KEY,
                term TEXT NOT NULL,
                original_value TEXT,
                table_name TEXT NOT NULL,
                column_name TEXT NOT NULL,
                record_id TEXT,
                ts tsvector
            );
        """)
        
        # Index on term for fast prefix search
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{SEARCH_INDEX_TABLE}_term ON {SEARCH_INDEX_TABLE} USING btree (term text_pattern_ops);")
        # GIN Trigram Index for correct Fuzzy Matching
        # We wrap in try/except because it depends on pg_trgm being successful
        try:
             cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{SEARCH_INDEX_TABLE}_trgm ON {SEARCH_INDEX_TABLE} USING GIN (term gin_trgm_ops);")
        except:
             conn.rollback()
             cur = conn.cursor()
             logger.warning("Could not create GIN Trigram index. Fuzzy search will be disabled.")

        # Index on tsvector for full text search if needed
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{SEARCH_INDEX_TABLE}_ts ON {SEARCH_INDEX_TABLE} USING GIN (ts);")
        
        if force_rebuild:
            cur.execute(f"TRUNCATE TABLE {SEARCH_INDEX_TABLE}")

        # 3. Find candidate columns (text, varchar)
        # We verify we are in the public schema or make it configurable? Default public.
        cur.execute("""
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND data_type IN ('text', 'character varying', 'char')
              AND table_name != %s
        """, (SEARCH_INDEX_TABLE,))
        
        columns = cur.fetchall()
        
        indexed_count = 0
        
        for col in columns:
            t_name = col[0]
            c_name = col[1]
            
            # Heuristic: Skip massive tables or unlikely columns (like UUIDs, hashes, logs)
            if 'password' in c_name.lower() or 'hash' in c_name.lower():
                continue
                
            # 4. Populate Index
            # We want to extract distinct values to keep index small? 
            # Or distinct per record?
            # User wants "Find customer who bought Titanium Widget". -> We need to know which RECORD has it.
            # So we map Value -> (Table, Column, ID)
            
            # Find Primary Key of this table
            cur.execute(f"""
                SELECT kcu.column_name
                FROM information_schema.key_column_usage kcu
                WHERE table_schema = 'public'
                  AND table_name = %s
                  AND constraint_name LIKE '%%pkey'
                LIMIT 1
            """, (t_name,))
            pk_res = cur.fetchone()
            pk_col = pk_res[0] if pk_res else None
            
            if not pk_col:
                # Fallback: maintain row reference? Or skip
                # Only helpful if we can identify the row.
                 continue

            # Insert strategy:
            # Select distinct values and their PKs? 
            # If a value appears 1000 times, we might not want 1000 index entries.
            # But specific items "Titanium Widget" likely unique-ish.
            # Limit to top N distinct values?
            
            logger.info(f"Indexing {t_name}.{c_name}...")
            
            # Only index distinct values to save space? 
            # No, we need the PK to tell the user "ID 505".
            # So: Select id, val from table
            
            # SAFETY: Limit to 1000 rows for demo/safety per table
            cur.execute(f"""
                INSERT INTO {SEARCH_INDEX_TABLE} (term, original_value, table_name, column_name, record_id, ts)
                SELECT 
                    LEFT({c_name}, 255), -- Truncate term
                    LEFT({c_name}, 255),
                    '{t_name}', 
                    '{c_name}', 
                    {pk_col}::text,
                    to_tsvector('english', left({c_name}, 255))
                FROM {t_name}
                WHERE {c_name} IS NOT NULL
                LIMIT 1000
                ON CONFLICT DO NOTHING -- No unique constraint yet, but good practice
            """)
            
            indexed_count += cur.rowcount

        logger.info(f"Indexing complete. Added {indexed_count} entries.")
        return {"status": "success", "indexed_entries": indexed_count}

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()

def search_database(connection_info: dict, query_term: str, limit: int = 5) -> list:
    """
    Searches the index for the query_term.
    Returns list of { table, column, value, id }
    """
    conn = None
    try:
        conn = psycopg2.connect(**connection_info)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Simple ILIKE search on term
        # 2. Or TSVector search
        
        # Simple ILIKE is robust for partial matches
        sql = f"""
            SELECT table_name, column_name, original_value, record_id
            FROM {SEARCH_INDEX_TABLE}
            WHERE term ILIKE %s
            LIMIT %s
        """
        like_term = f"%{query_term}%"
        cur.execute(sql, (like_term, limit))
        results = cur.fetchall()
        
        return results

    finally:
        if conn:
            conn.close()

def search_similiar(connection_info: dict, query_term: str, limit: int = 5) -> list:
    """
    Searches using Trigram similarity if available, else standard ILIKE.
    Returns ranked results.
    """
    conn = None
    try:
        conn = psycopg2.connect(**connection_info)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Check if pg_trgm is available?
        # We can just attempt the query. if it fails, fallback.
        
        try:
            # Fuzzy match using similarity
            # We want specific values.
            sql = f"""
                SELECT table_name, column_name, original_value, record_id,
                       similarity(term, %s) as score
                FROM {SEARCH_INDEX_TABLE}
                WHERE term %% %s -- '%%' is the similarity operator in Postgres
                   OR term ILIKE %s
                ORDER BY score DESC, term ASC
                LIMIT %s
            """
            like_term = f"%{query_term}%"
            cur.execute(sql, (query_term, query_term, like_term, limit))
            results = cur.fetchall()
            return results
        except Exception as fuzzy_err:
             # logger.warning(f"Fuzzy search failed (likely no extension), falling back: {fuzzy_err}")
             conn.rollback()
             cur = conn.cursor(cursor_factory=RealDictCursor)
             
             # Fallback
             sql = f"""
                SELECT table_name, column_name, original_value, record_id, 0 as score
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

# Alias for backward compatibility if needed, or replace usage
search_database = search_similiar

SEARCHABLE_ENTITIES = [
    {"table": "people", "column": "name", "type": "Actor/Person"},
    {"table": "movies", "column": "name", "type": "Movie"} # Changed title to name based on user schema assumption in previous turns (movies.name)
]

def autocomplete_entity(connection_info: dict, term: str, table: str = None) -> list:
    """
    Performs a safe, prefix-based search dynamically on tables or specific table data.
    """
    conn = None
    try:
        conn = psycopg2.connect(**connection_info)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        from psycopg2 import sql
        
        # Safety limit
        cur.execute("SET statement_timeout = '500ms';")
        
        results = []
        
        if table:
            # Search specific table data
            try:
                # User requested specific query structure
                query = sql.SQL("""
                    SELECT id::text, name 
                    FROM {} 
                    WHERE name ILIKE %s 
                    LIMIT 10
                """).format(sql.Identifier(table))
                
                cur.execute(query, (f"{term}%",))
                rows = cur.fetchall()
                results = [{"value": r['name'], "meta": f"{table} (ID: {r.get('id', '?')})", "type": "entity"} for r in rows]
            except Exception as e:
                # Likely missing 'id' or 'name' column
                logger.warning(f"Autocomplete data lookup failed for {table}: {e}")
                conn.rollback()
        else:
            # 1. Search Table Names
            try:
                cur.execute("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                      AND table_name ILIKE %s 
                    LIMIT 5
                """, (f"{term}%",))
                rows = cur.fetchall()
                results.extend([{"value": r['table_name'], "meta": "Table", "type": "table"} for r in rows])
            except Exception as e:
                logger.error(f"Table lookup failed: {e}")
                conn.rollback()

            # 2. Search Configured Data Entities
            for entity in SEARCHABLE_ENTITIES:
                try:
                     # Check if table exists first? No, just try/catch
                     q = sql.SQL("""
                        SELECT id::text, {col} as label
                        FROM {tbl}
                        WHERE {col} ILIKE %s
                        LIMIT 5
                     """).format(
                        col=sql.Identifier(entity['column']),
                        tbl=sql.Identifier(entity['table'])
                     )
                     cur.execute(q, (f"{term}%",))
                     rows = cur.fetchall()
                     results.extend([{
                         "value": r['label'], 
                         "meta": f"{entity['type']} (ID: {r.get('id', '?')})", 
                         "type": "entity"
                     } for r in rows])
                except Exception as e:
                    # Ignore errors (table missing, col missing)
                    conn.rollback()
                    
        return results

    except Exception as e:
        logger.error(f"Autocomplete failed: {e}")
        return []
    finally:
        if conn:
            conn.close()
