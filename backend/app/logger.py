
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

    data_dir = os.getenv("PGRAY_DATA_DIR", os.path.expanduser("~/.pgray"))
    try:
        os.makedirs(data_dir, exist_ok=True)
        log_file_path = os.path.join(data_dir, "server.log")
        file_handler = logging.FileHandler(log_file_path)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        sys.stderr.write(f"Logging configured. Writing to {log_file_path}\n")
    except Exception as e:
        sys.stderr.write(f"Could not configure file logger: {e}\n")

    logger.info("Server logging initialized successfully.")
