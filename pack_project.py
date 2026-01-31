import os

# Files/Folders to strictly IGNORE
IGNORE_DIRS = {
    "node_modules", ".git", "__pycache__", "venv", "env", 
    "dist", "build", ".vscode", ".idea", "pg_data"
}
IGNORE_EXTENSIONS = {
    ".pyc", ".png", ".jpg", ".jpeg", ".gif", ".ico", 
    ".svg", ".eot", ".ttf", ".woff", ".woff2", ".lock", 
    ".gguf", ".bin", ".exe", ".zip", ".gz"
}
IGNORE_FILES = {
    "package-lock.json", "yarn.lock", "poetry.lock"
}

def is_text_file(filename):
    return not any(filename.endswith(ext) for ext in IGNORE_EXTENSIONS)

def pack_project():
    output_file = "pgray_full_context.txt"
    
    with open(output_file, "w", encoding="utf-8") as outfile:
        # Write a header
        outfile.write(f"PROJECT CONTEXT DUMP\n")
        outfile.write("====================\n\n")

        for root, dirs, files in os.walk("."):
            # Modify dirs in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            
            for file in files:
                if file in IGNORE_FILES or not is_text_file(file):
                    continue
                
                # Avoid packaging the script itself or the output file
                if file == "pack_project.py" or file == output_file:
                    continue

                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, "r", encoding="utf-8") as infile:
                        content = infile.read()
                        
                        # The Delimiter I need to understand the structure
                        outfile.write(f"\n\n{'='*60}\n")
                        outfile.write(f"FILE PATH: {file_path}\n")
                        outfile.write(f"{'='*60}\n")
                        outfile.write(content + "\n")
                        print(f"Packed: {file_path}")
                except Exception as e:
                    print(f"Skipping binary or unreadable file: {file_path}")

    print(f"\n✅ Success! All code packed into: {output_file}")
    print(f"📁 Size: {os.path.getsize(output_file) / 1024:.2f} KB")

if __name__ == "__main__":
    pack_project()