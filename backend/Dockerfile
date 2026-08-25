# "Start with Linux + Python 3.11, prepare the operating system, install my Python dependencies, copy my FastAPI application into the container, and when the container starts, run Uvicorn on port 8000 and listen on all interfaces."

# ---- Base image: a lightweight Linux with Python 3.11 pre-installed ----
# "slim" = smaller download, removes the unwanted packages. "why 3.11": stable,
# widely supported. Match this to whatever Python version you develop on.
FROM python:3.11-slim

# ---- Set the working folder inside the container ----
# Everything after this happens inside /app. Think of it as "cd /app".
WORKDIR /app

# ---- Install system libraries your Python packages need ----
# Some packages (like those that handle PDFs, images, or database drivers)
# need OS-level libraries. Add here if a build fails asking for one.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

#build-essential - some package contain native C/C++ components
# "rm -rf .../lists" = delete the cached Linux package metadata so the image stays small.

# ---- Install Python dependencies FIRST, before copying code ----
# Why separately: Docker caches each step. Dependencies change rarely; your code
# changes constantly. Copying requirements first means rebuilds only reinstall
# packages when requirements.txt actually changes — much faster rebuilds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
#no-cache-dir because we dont need to keep download package caches in docker images like pip keeps

# ---- Now copy the rest of your backend code ----
COPY . .

# ---- Document which port the app uses (informational) ----
#---EXPOSE does not actually publish the port to your computer.
#---Browser -> localhost:8000 -> Docker -> Container :8000 -> Uvicorn -> FastAPI
EXPOSE 8000

# ---- The command that runs when the container starts ----
#---host 0.0.0.0 is MANDATORY (see pre-flight 1.1) - 
#---0.0.0.0 means"Listen on all network interfaces available to this container."
# Note: no --reload in production (that's a dev-only feature that wastes resources).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "8"]
 