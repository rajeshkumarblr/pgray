from pydantic import BaseModel, Field

class ConnectionInfo(BaseModel):
    host: str = Field(..., description="Postgres host, e.g., localhost or host.docker.internal")
    port: int = Field(5432, description="Postgres port")
    username: str = Field(..., description="Database username")
    password: str = Field(..., description="Database password")
    database: str = Field(..., description="Database name")
    schema: str = Field('public', description="Schema name (used to set search_path)")

class ConnectionRequest(BaseModel):
    connection: ConnectionInfo

class ExplainRequest(BaseModel):
    connection: ConnectionInfo
    query: str = Field(..., description="SQL query to explain")
