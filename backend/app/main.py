from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.models import ConnectionRequest, ExplainRequest, QueryRequest, GenerateSqlRequest, ExplainSqlRequest
from app.connection import test_connection
from app.explain import execute_explain, execute_query_results
from app.history import init_db, add_history_item, get_history_items

app = FastAPI(title="PGray Backend")

@app.on_event("startup")
async def startup_event():
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
        result = execute_query_results(request.connection, request.query, request.limit)
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
                request.sql_query
            ),
            media_type="text/plain"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveQueryRequest(BaseModel):
    name: str
    sql: str
    history: list = []

@app.get("/api/saved_queries")
async def get_saved_queries_endpoint():
    try:
        from app.saved_queries import list_saved_queries, list_parameterized_queries
        return {
            "status": "success", 
            "queries": list_saved_queries(),
            "parameterized": list_parameterized_queries()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/saved_queries")
async def delete_all_saved_queries_endpoint():
    try:
        from app.saved_queries import delete_all_saved_queries
        success = delete_all_saved_queries()
        if success:
             return {"status": "success"}
        else:
             raise HTTPException(status_code=500, detail="Failed to delete queries")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/saved_queries")
async def save_query_endpoint(request: SaveQueryRequest):
    try:
        from app.saved_queries import save_query
        name = save_query(request.name, request.sql, request.history)
        return {"status": "success", "name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/saved_queries/{name}")
async def get_saved_query_content_endpoint(name: str):
    try:
        from app.saved_queries import get_saved_query
        data = get_saved_query(name) # returns dict {sql, history}
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

@app.post("/api/history/append")
async def append_history_endpoint(request: HistoryTurnRequest):
    try:
        from app.saved_queries import append_session_history
        success = append_session_history(request.title, request.prompt, request.response)
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

@app.post("/api/history/save_session")
async def save_full_session_endpoint(request: FullSessionRequest):
    try:
        from app.saved_queries import save_full_session_to_history
        success = save_full_session_to_history(request.title, request.sql, request.history)
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

@app.post("/api/queries/analyze")
async def analyze_query_endpoint(request: ParameterizeRequest):
    try:
        from app.ai import analyze_parameterized_query
        result = await analyze_parameterized_query(request.sql, request.model)
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

@app.post("/api/queries/save")
async def save_final_query_endpoint(request: SaveFinalQueryRequest):
    try:
        from app.saved_queries import save_parameterized_query as save_db
        saved_record = save_db(
            request.name,
            request.sql,
            request.params,
            request.original_sql
        )
        return {"status": "success", "data": saved_record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

