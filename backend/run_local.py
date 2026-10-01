import argparse
import os
import shutil
import socket
import sys

# Explicit imports so PyInstaller traces and bundles all application and uvicorn modules
import uvicorn
import uvicorn.logging
import uvicorn.loops
import uvicorn.loops.auto
import uvicorn.protocols
import uvicorn.protocols.http
import uvicorn.protocols.http.auto
import uvicorn.protocols.websockets
import uvicorn.protocols.websockets.auto
import uvicorn.lifespan
import uvicorn.lifespan.on
import psycopg2
import psycopg2.extras
import psycopg2.sql
import httpx
import requests

def find_available_port(preferred_port: int = 9000) -> int:
    if preferred_port > 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", preferred_port))
                return preferred_port
            except OSError:
                pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def seed_initial_data(data_dir: str):
    target_sq = os.path.join(data_dir, "saved_queries")
    if os.path.exists(target_sq):
        return
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(sys.executable)), "saved_queries"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_queries"),
    ]
    for src in candidates:
        if os.path.isdir(src):
            try:
                shutil.copytree(src, target_sq)
                break
            except Exception as e:
                sys.stderr.write(f"Could not seed saved_queries from {src}: {e}\n")

def main():
    parser = argparse.ArgumentParser(description="PGRay Local Backend")
    parser.add_argument("--port", type=int, default=9000, help="Preferred port (default: 9000)")
    parser.add_argument(
        "--data-dir",
        type=str,
        default=os.path.expanduser("~/.pgray"),
        help="Directory for persistent data (history.db, saved_queries, connection.json)",
    )
    args = parser.parse_args()

    data_dir = os.path.abspath(os.path.expanduser(args.data_dir))
    os.makedirs(data_dir, exist_ok=True)
    os.environ["PGRAY_DATA_DIR"] = data_dir
    seed_initial_data(data_dir)

    # Import app modules after PGRAY_DATA_DIR is set
    import app.ai
    import app.ask_history
    import app.connection
    import app.db_utils
    import app.explain
    import app.history
    import app.logger
    import app.models
    import app.saved_queries
    import app.search_engine
    from app.main import app as fastapi_app

    port = find_available_port(args.port)

    @fastapi_app.on_event("startup")
    async def _announce_listening():
        sys.stdout.write(f"LISTENING:{port}\n")
        sys.stdout.flush()

    uvicorn.run(fastapi_app, host="127.0.0.1", port=port, log_level="info")

if __name__ == "__main__":
    main()
