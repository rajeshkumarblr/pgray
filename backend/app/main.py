from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from app.models import ConnectionRequest, ExplainRequest, QueryRequest, GenerateSqlRequest, ExplainSqlRequest, ConnectionInfo
from app.connection import test_connection
from app.explain import execute_explain, execute_query_results
from app.history import init_db, add_history_item, get_history_items
import json

app = FastAPI(title="PGray Backend")

@app.on_event("startup")
async def startup_event():
    from app.logger import setup_logging
    setup_logging()
    init_db()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "PGray Backend is running"}

@app.post("/api/connect")
async def connect_db(request: ConnectionRequest):
    try:
        test_connection(request.connection)
        return {"status": "success", "message": f"Connected to {request.connection.host}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/explain")
async def explain_query(request: ExplainRequest):
    try:
        # Save query to history
        add_history_item(request.query)
        
        result = execute_explain(request.connection, request.query, request.analyze)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/execute")
async def execute_query(request: QueryRequest):
    try:
        # We also save to history
        add_history_item(request.query)
        result = execute_query_results(request.connection, request.query, request.limit, request.params)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/history")
async def get_history():
    try:
        history = get_history_items()
        return {"status": "success", "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Schema endpoint
@app.post("/api/schema")
async def get_schema(request: ConnectionRequest):
    try:
        # Import here to avoid circular dependencies if any, or just use the one imporetd
        from app.explain import get_schema_tree
        schema = get_schema_tree(request.connection)
        return {"status": "success", "data": schema}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/settings")
async def get_settings(request: ConnectionRequest):
    try:
        from app.explain import get_pg_settings
        settings = get_pg_settings(request.connection)
        return {"status": "success", "data": settings}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/databases")
async def get_databases_endpoint(request: ConnectionRequest):
    try:
        from app.db_utils import get_databases
        dbs = get_databases(request.connection)
        return {"status": "success", "databases": dbs}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/generate_sql")
def generate_sql_endpoint(request: GenerateSqlRequest):
    try:
        from app.ai import generate_sql
        # Pass model from request to generate_sql
        result = generate_sql(
            request.prompt, 
            request.schema_context, 
            request.schema_data, 
            request.history,
            request.model,
            request.connection
        )
        # result is { "sql": str, "prompt": str }
        return {
            "status": "success", 
            "sql": result.get("sql"), 
            "prompt": result.get("prompt")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/explain_sql")
async def explain_sql_endpoint(request: ExplainSqlRequest):
    try:
        from app.ai import explain_sql_query
        explanation = explain_sql_query(
            request.query, 
            None, 
            request.schema_data, 
            request.model
        )
        return {"status": "success", "explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate_sql_stream")
async def generate_sql_stream_endpoint(request: GenerateSqlRequest):
    try:
        from app.ai import generate_sql_stream
        return StreamingResponse(
            generate_sql_stream(
                request.prompt, 
                request.schema_context, 
                request.schema_data, 
                request.history, 
                request.model,
                request.plan_text,
                request.sql_query,
                request.apiKey,
                request.ollamaUrl
            ),
            media_type="text/plain"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveQueryRequest(BaseModel):
    name: str
    sql: str
    history: list = []
    connection: Optional[ConnectionInfo] = None

@app.get("/api/saved_queries")
async def get_saved_queries_endpoint(connection_json: Optional[str] = Query(None)):
    try:
        connection = None
        if connection_json:
            try:
                connection = json.loads(connection_json)
            except:
                pass

        from app.saved_queries import list_saved_queries, list_parameterized_queries
        
        # We need to dict-ify if it's pydantic, but here it's just dict if parsed from JSON
        return {
            "status": "success", 
            "queries": list_saved_queries(connection),
            "parameterized": list_parameterized_queries(connection)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/saved_queries")
async def delete_all_saved_queries_endpoint(connection_json: Optional[str] = Query(None)):
    try:
        connection = None
        if connection_json:
             try:
                connection = json.loads(connection_json)
             except:
                pass

        from app.saved_queries import delete_all_saved_queries
        success = delete_all_saved_queries(connection)
        if success:
             return {"status": "success"}
        else:
             raise HTTPException(status_code=500, detail="Failed to delete queries")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/saved_queries")
async def save_query_endpoint(request: SaveQueryRequest):
    try:
        pass 
        # Legacy save_query used for sessions? 
        return {"status": "error", "message": "Endpoint deprecated or not implemented"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/saved_queries/{name}")
async def get_saved_query_content_endpoint(name: str, connection_json: Optional[str] = Query(None)):
    try:
        connection = None
        if connection_json:
            try:
                connection = json.loads(connection_json)
            except:
                pass

        from app.saved_queries import get_saved_query
        data = get_saved_query(name, connection) 
        if data is None:
             raise HTTPException(status_code=404, detail="Query not found")
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class GenerateTitleRequest(BaseModel):
    prompt: str
    model: str = "qwen2.5-coder"

@app.post("/api/generate_title")
async def generate_title_endpoint(request: GenerateTitleRequest):
    try:
        from app.ai import generate_title
        title = await generate_title(request.prompt, request.model)
        return {"status": "success", "title": title}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



class HistoryTurnRequest(BaseModel):
    title: str
    prompt: str
    response: str
    connection: Optional[ConnectionInfo] = None

@app.post("/api/history/append")
async def append_history_endpoint(request: HistoryTurnRequest):
    try:
        from app.saved_queries import append_session_history
        # Convert ConnectionInfo pydantic to dict
        conn_dict = request.connection.model_dump() if request.connection else None
        
        success = append_session_history(request.title, request.prompt, request.response, conn_dict)
        if success:
            return {"status": "success"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save history")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class FullSessionRequest(BaseModel):
    title: str
    sql: str
    history: list
    connection: Optional[ConnectionInfo] = None

@app.post("/api/history/save_session")
async def save_full_session_endpoint(request: FullSessionRequest):
    try:
        from app.saved_queries import save_full_session_to_history
        conn_dict = request.connection.model_dump() if request.connection else None
        
        success = save_full_session_to_history(request.title, request.sql, request.history, conn_dict)
        if success:
            return {"status": "success"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save session")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/config/connection")
async def get_connection_config():
    """
    Reads connection.json from the backend directory to auto-fill credentials.
    """
    import os
    import json
    
    config_path = os.path.join(os.path.dirname(__file__), "..", "connection.json")
    if not os.path.exists(config_path):
        return {"status": "error", "message": "connection.json not found"}
        
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
            # Basic validation
            required = ["host", "port", "user", "password", "database"]
            if not all(k in config for k in required):
                return {"status": "error", "message": "Invalid config format"}
            return {"status": "success", "data": config}

    except Exception as e:
        return {"status": "error", "message": str(e)}

class ParameterizeRequest(BaseModel):
    sql: str
    model: str = "qwen2.5-coder"
    title: str = None # Optional existing title

@app.post("/api/queries/analyze")
async def analyze_query_endpoint(request: ParameterizeRequest):
    try:
        from app.ai import analyze_parameterized_query
        result = await analyze_parameterized_query(request.sql, request.model, request.title)
        if "error" in result:
             raise HTTPException(status_code=500, detail=result["error"])
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveFinalQueryRequest(BaseModel):
    name: str
    sql: str
    params: list
    original_sql: str
    connection: Optional[ConnectionInfo] = None

@app.post("/api/queries/save")
async def save_final_query_endpoint(request: SaveFinalQueryRequest):
    try:
        from app.saved_queries import save_parameterized_query as save_db
        conn_dict = request.connection.model_dump() if request.connection else None
        
        saved_record = save_db(
            request.name,
            request.sql,
            request.params,
            request.original_sql,
            conn_dict
        )
        return {"status": "success", "data": saved_record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DistinctValuesRequest(BaseModel):
    table: str
    column: str
    connection: ConnectionInfo
    search: str = None # Optional search term

@app.post("/api/db/values")
async def get_distinct_values_endpoint(request: DistinctValuesRequest):
    try:
        from app.db_utils import get_distinct_values
        values = get_distinct_values(request.connection, request.table, request.column, request.search) 
        return {"status": "success", "values": values}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/queries/{query_id}")
async def delete_query_endpoint(query_id: str, connection_json: Optional[str] = Query(None)):
    try:
        connection = None
        if connection_json:
             try:
                connection = json.loads(connection_json)
             except:
                pass

        from app.saved_queries import delete_saved_query
        success = delete_saved_query(query_id, connection)
        if not success:
            raise HTTPException(status_code=404, detail="Query not found")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/models")
async def get_models_endpoint():
    try:
        from app.ai import list_models
        models = await list_models()
        return {"status": "success", "models": models}
    except Exception as e:
        return {"status": "error", "models": ["qwen2.5-coder"], "message": str(e)}

class WarmupRequest(BaseModel):
    model: str = "qwen2.5-coder:latest"

@app.post("/api/warmup")
async def warmup_endpoint(request: WarmupRequest, background_tasks: BackgroundTasks):
    try:
        from app.ai import warmup_model
        # Run in background to not block the typing user
        background_tasks.add_task(warmup_model, request.model)
        return {"status": "success"}
    except Exception as e:
        # Don't fail the request, just log
        pass

class SaveLayoutRequest(BaseModel):
    layout: dict
    connection: Optional[ConnectionInfo] = None

@app.post("/api/er_layout")
async def save_er_layout_endpoint(request: SaveLayoutRequest):
    try:
        from app.saved_queries import save_er_layout
        conn_dict = request.connection.model_dump() if request.connection else None
        
        save_er_layout(request.layout, conn_dict)
        return {"status": "success"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/er_layout")
async def get_er_layout_endpoint(connection_json: Optional[str] = Query(None)):
    try:
        connection = None
        if connection_json:
            try:
                connection = json.loads(connection_json)
            except:
                pass
                
        from app.saved_queries import get_er_layout
        layout = get_er_layout(connection)
        return {"status": "success", "layout": layout}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))
