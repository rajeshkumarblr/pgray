# pgRay - Postgres Query Visualizer

pgRay is a full-stack application that visualizes PostgreSQL `EXPLAIN ANALYZE` plans using an interactive node-link diagram. It combines modern visualization with AI-powered insights to help developers optimize query performance.

![Hero Image](screenshots/screenshot_analyze_query.png)

## Features

*   **Interactive Visualization**:
    *   **Node-Link Diagram**: Visualize complicated execution plans using React Flow.
    *   **Smart Layout**: Hierarchical tree layout with explorer-style connectors.
    *   **Node Metrics**: Instant visibility of Rows (Est/Act), Time, and Loops directly on the node.
    *   **Context Menu**: Right-click any node to **Analyze** it with AI or view details.
    *   **Auto-Fit**: Automatically centers and zooms the graph for the best view.

*   **Local-First AI Assistant**:
    *   **Context-Aware**: Understands your database schema and query history.
    *   **Text-to-SQL**: Generate complex SQL from natural language questions.
    *   **Real-Time Streaming**: Watch the SQL appear in your editor character-by-character as the AI types it.
    *   **Auto-Explain Loop**: Automatically runs `EXPLAIN ANALYZE` on generated queries to fetch real performance metrics immediately.
    *   **Compact Chat UI**: SQL previews are unobtrusive text links; timings are displayed as `(P: 8ms, E: 78ms)`.
    *   **Interactive Analysis**: Ask "Analyze Node" to get deep optimization advice.
    *   **Actionable Insights**: AI automatically suggests SQL fixes (e.g., `CREATE INDEX`) which are extracted into a dedicated "Insights" tab.
    *   **Granular Execution**: Execute suggested optimizations individually with instant success/failure feedback via toast notifications.
    *   **Performance Comparison**: Measure impact with a "Compare" tool that shows optimization gains (e.g., "Planning: -10ms") against your original baseline.
    *   **Dual Engine Support**: Switch seamlessly between **Local AI** (Ollama) for privacy and **Google Gemini** for enhanced reasoning.
    *   **Smart Warmup**: "Warmup-on-Type" ensures models are loaded and ready before you even hit send, minimizing latency.
    *   **Performance Metrics**: Real-time "Time to First Token" (TTFT) tracking to monitor AI responsiveness.

*   **Flexible Workspace**:
    *   **Three-Pane Layout**: Editor (Left), Visualizer (Center), Assistant (Right).
    *   **Resizable Panes**: Customize the width of the AI Sidebar and height of the Results pane.
    *   **Tabbed Interface**: seamlessly switch between the **Editor**, **Tune** (Visualizer), and **Server** tabs.

*   **Session Management**:
    *   **Explicit Save**: Sessions start as scratchpads. Saving them permanently stores the query.
    *   **Auto-Naming**: AI automatically generates descriptive titles (e.g., "Movies by Actor") upon saving.
    *   **Parameterized Storage**: Saved queries are automatically parameterized (e.g., `WHERE name = :name` or `LIMIT :limit_val`) for reuse.
    *   **History**: Access previously saved sessions and resume work instantly.
    *   **Queries Tab**: Dedicated tab to explore, fill parameters (e.g., `:actor_name`), and Execute saved queries without losing context.
    *   **Visual Query Management**: Edit, Duplicate, or Delete saved queries directly from a consolidated toolbar.
    *   **Context Menu**: Right-click saved queries to **Rename**, **Duplicate**, or **Delete** them instantly.
    *   **Enhanced Layout**: SQL Editor maximizes to fill the screen ("flex-grow") with long-line wrapping, while keeping controls pinned to the footer.
    *   **Searchable Dropdowns**: Parameters with table/column metadata show a searchable dropdown that filters potential values from the database in real-time.
    *   **Fast Save**: Intelligent title skipping and robust regex parameter detection ensure saving is instant and accurate, even for complex queries.
    *   **Settings Management**: Centralized configuration modal (Gear Icon) to manage Database Connections, AI Providers (Ollama/Gemini), and specific Model versions (e.g., `gemini-1.5-flash`).
    *   **Clean Startup**: Application always launches in a pristine state ("New Query") to prevent context clutter.

*   **Deep Analytics**:
    *   **Results Tab**: View actual query result rows immediately.
    *   **CSV Export**: One-click download of query results to CSV for external analysis.
    *   **Node Details**: Drill down into specific operators to see Filters, Buffer Usage, and Output columns.
    *   **Diff View**: Compare the AI's suggested query changes against your original code side-by-side.

    *   **Diff View**: Compare the AI's suggested query changes against your original code side-by-side.
    
## Visual Tour

### 1. Interactive Analysis & Insights
![Visual Explain & Analysis](screenshots/screenshot_analyze_query.png)
The core of pgRay is the **Interactive Node-Link Diagram**. 
- **Time Analysis**: Nodes are color-coded by execution time (Red = Slow).
- **Deep Metrics**: See Row Estimates vs Actuals, Buffer Usage, and Filter effectiveness at a glance.
- **AI Sidebar**: The **Actionable Insights** panel (bottom) lists concrete optimization steps (e.g., `CREATE INDEX`) extracted by AI.

### 2. Saved Queries & Parameter Management
![Saved Queries & Parameters](screenshots/screenshot_queries.png)
Stop rewriting the same complex JOINs.
- **Parameterization**: pgRay automatically detects variables (e.g., `:director_name`) and generates input forms for them.
- **Smart Search**: Parameters linked to columns (via AI metadata) offer **Autocomplete Dropdowns** that search your actual database values.
- **Organization**: Rename, Duplicate, or Delete queries with right-click context menus.

### 3. Clean Workspace & AI Chat
![Clean Editor](screenshots/screenshot_new_query.png)
Start fresh with a focused environment.
- **Dual AI Engine**: Choose between **Local AI (Ollama)** for privacy or **Google Gemini** for cloud-powered reasoning.
- **Natural Language SQL**: Ask "Top 5 movies by revenue" and watch the SQL stream into the editor.
- **Instant Feedback**: Execute queries immediately and see results in the grid view.

### 4. Centralized Configuration
![DB Settings](screenshots/screenshot_db_settings.png)
![AI Settings](screenshots/screenshot_ai_settings.png)
Manage everything from one place.
- **Connection Manager**: Easily switch between databases or update credentials.
- **AI Models**: Toggle between **Ollama (Local)** and **Gemini (Cloud)**, configure API keys, and set specific model versions (e.g., `gemini-1.5-flash`).

## Architecture

*   **Frontend**: React, Vite, React Flow
*   **Backend**: Python FastAPI, Pydantic, Psycopg2, Ollama (AI)
*   **Database**: Connects to any accessible Postgres instance

## Getting Started

### Prerequisites

*   Docker and Docker Compose
*   A local PostgreSQL database
*   [Ollama](https://ollama.ai/) running locally (for Local AI mode)
*   (Optional) Google AI Studio API Key (for Cloud AI mode)

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
    *   **Frontend**: [http://localhost:3000](http://localhost:3000)
    *   **Backend API**: [http://localhost:9000/docs](http://localhost:9000/docs)

### Connecting to Database

Create a `connection.json` file in the `backend/` directory to auto-fill your credentials:

```json
{
  "host": "host.docker.internal",
  "port": "5432",
  "user": "postgres",
  "password": "yourpassword",
  "database": "postgres"
}
```

## License

[Apache 2.0](LICENSE)
