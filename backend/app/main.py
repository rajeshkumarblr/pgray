from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models import ConnectionRequest, ExplainRequest
from app.connection import test_connection
from app.explain import execute_explain

app = FastAPI(title="PGray Backend")

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
        plan = execute_explain(request.connection, request.query)
        return {"status": "success", "plan": plan}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
