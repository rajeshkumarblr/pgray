from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

class ConnectionInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    host: str = Field(..., description="Postgres host, e.g., localhost or host.docker.internal")
    port: int = Field(5432, description="Postgres port")
    username: str = Field(..., description="Database username")
    password: str = Field(..., description="Database password")
    database: str = Field(..., description="Database name")
    schema_name: str = Field('public', alias='schema', description="Schema name (used to set search_path)")

class ConnectionRequest(BaseModel):
    connection: ConnectionInfo

class ExplainRequest(BaseModel):
    connection: ConnectionInfo
    query: str = Field(..., description="SQL query to explain")
