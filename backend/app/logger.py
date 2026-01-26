
import logging
import os
import sys

def setup_logging():
    """
    Configures the root logger to output to both console and a server.log file.
    """
    # Create logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Formatters
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Console Handler (Stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File Handler (server.log)
    # This will create server.log in /app/server.log inside the container,
    # which is mapped to backend/server.log on host if using the volume map in docker-compose
    log_file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "server.log")
    
    file_handler = logging.FileHandler(log_file_path)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    sys.stderr.write(f"Logging configured. Writing to {log_file_path}\n")
    logger.info("Server logging initialized successfully.")
