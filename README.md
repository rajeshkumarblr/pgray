# PGray - Postgres Query Visualizer

PGray is a full-stack application that visualizes PostgreSQL `EXPLAIN ANALYZE` plans in a tree-like structure, similar to tools like pgMustard. It allows developers to quickly investigate query performance issues by correlating the visual plan with the raw JSON output.

## Features

*   **Connect to Local Database**: Securely connects to your local Postgres instance via Docker.
*   **Run Explain Plans**: Type raw SQL and execute `EXPLAIN (FORMAT JSON, ANALYZE)` instantly.
*   **Visual Tree**: Interactive node-link diagram of the execution plan using React Flow and Dagre layout.
*   **Performance Metrics**: See estimated costs vs. actual rows and execution times per node.
*   **Raw Plan Inspection**: View the full JSON output side-by-side with the visual tree.

## Screenshot

![PGray App Screenshot](screenshots/screenshot.png)

## Architecture

*   **Frontend**: React, Vite, React Flow, Axios, Dagre
*   **Backend**: Python FastAPI, Pydantic, Psycopg2
*   **Database**: Connects to user-provided Postgres instance
*   **Infrastructure**: Docker Compose (services linked via `host.docker.internal`)

## Getting Started

### Prerequisites

*   Docker and Docker Compose
*   A local PostgreSQL database

### Installation & Run

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/pgray.git
    cd pgray
    ```

2.  Start the application:
    ```bash
    docker-compose up --build
    ```

3.  Access the App:
    *   **Frontend**: [http://localhost:4000](http://localhost:4000)
    *   **Backend API**: [http://localhost:9000/docs](http://localhost:9000/docs)

### Connecting to Localhost Postgres

Since the app runs in Docker, use the host `host.docker.internal` to refer to your local machine's Postgres.

**Important**: You may need to configure your `pg_hba.conf` to allow connections from the Docker subnet (e.g., `172.16.0.0/12`).

```conf
# /etc/postgresql/<version>/main/pg_hba.conf
host    all             all             172.16.0.0/12           scram-sha-256
```

## License

[Apache 2.0](LICENSE)
