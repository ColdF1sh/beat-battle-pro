FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ffmpeg \
      libsndfile1 \
      pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      "numpy<2" \
      scipy \
      scikit-learn \
      librosa==0.11.0 \
      soundfile==0.13.1 \
      essentia==2.1b6.dev1110

COPY scripts/analyze-audio-key-bpm.py scripts/analyze-audio-key-bpm.py
COPY scripts/analyzer-server.py scripts/analyzer-server.py

EXPOSE 8765

CMD ["python", "scripts/analyzer-server.py"]
