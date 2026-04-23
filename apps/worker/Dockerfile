# ─── Base ─────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# System deps: ffmpeg binary + build tools for Whisper/Coqui compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    g++ \
    libsndfile1 \
    libsndfile1-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────
FROM base AS deps

COPY requirements.txt .

# Install PyTorch CPU-only first (smaller image, no CUDA bloat)
RUN pip install --no-cache-dir \
    torch==2.1.0 \
    torchaudio==2.1.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install the rest of the requirements
RUN pip install --no-cache-dir -r requirements.txt

# ─── Development ──────────────────────────────────────────────
FROM deps AS development
COPY . .

# Pre-download Whisper base model at build time so first job is instant
# Remove this line if you want faster builds and don't mind first-job delay
RUN python -c "import whisper; whisper.load_model('base')" || true

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

CMD ["python", "-m", "queue.worker"]

# ─── Production ───────────────────────────────────────────────
FROM deps AS production
COPY . .

# Pre-download models at build time
RUN python -c "import whisper; whisper.load_model('base')" || true

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

CMD ["python", "-m", "queue.worker"]