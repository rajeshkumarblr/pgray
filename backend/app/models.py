from typing import Optional
from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

class ConnectionInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    host: str = Field(..., description="Postgres host, e.g., localhost or host.docker.internal")
    port: int = Field(5432, description="Postgres port")
    username: str = Field(..., alias="user", description="Database username")
    password: str = Field(..., description="Database password")
    database: str = Field(..., description="Database name")
    schema_name: str = Field('public', alias='schema', description="Schema name (used to set search_path)")

class ConnectionRequest(BaseModel):
    connection: ConnectionInfo

class ExplainRequest(BaseModel):
    connection: ConnectionInfo
    query: str = Field(..., description="SQL query to explain")
    analyze: bool = Field(True, description="Whether to run EXPLAIN ANALYZE")

class QueryRequest(BaseModel):
    connection: ConnectionInfo
    query: str = Field(..., description="SQL query to execute")
    limit: int = Field(100, description="Max rows to fetch")
    params: Optional[dict] = Field(default_factory=dict, description="Query parameters")

class GenerateSqlRequest(BaseModel):
    prompt: str
    schema_context: Optional[str] = None
    schema_data: Optional[dict] = None
    history: Optional[list] = None
    model: Optional[str] = "qwen2.5-coder"
    connection: Optional[ConnectionInfo] = None # Added for server-side validation
    plan_text: Optional[str] = None # Added for optimization context
    sql_query: Optional[str] = None # Added for optimization context
    apiKey: Optional[str] = None # Google API Key
    ollamaUrl: Optional[str] = None # Custom Ollama URL

class ExplainSqlRequest(BaseModel):
    query: str
    schema_data: Optional[dict] = None
    model: Optional[str] = "qwen2.5-coder"
    apiKey: Optional[str] = None
