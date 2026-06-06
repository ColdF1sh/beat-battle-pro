FROM python:3.10-slim

WORKDIR /app

ARG ENABLE_KEYFINDER=true

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENABLE_KEYFINDER=${ENABLE_KEYFINDER}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      ffmpeg \
      libsndfile1 \
      pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN if [ "$ENABLE_KEYFINDER" = "true" ]; then \
      set -eux; \
      apt-get update; \
      apt-get install -y --no-install-recommends \
        cmake \
        git \
        libavcodec-dev \
        libavformat-dev \
        libavutil-dev \
        libfftw3-dev \
        libswresample-dev; \
      rm -rf /var/lib/apt/lists/*; \
      git clone --depth 1 https://github.com/mixxxdj/libkeyfinder.git /tmp/libkeyfinder; \
      cmake -S /tmp/libkeyfinder -B /tmp/libkeyfinder/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
        -DBUILD_SHARED_LIBS=ON; \
      cmake --build /tmp/libkeyfinder/build --parallel 2; \
      cmake --install /tmp/libkeyfinder/build; \
      ldconfig; \
      git clone --depth 1 https://github.com/evanpurkhiser/keyfinder-cli.git /tmp/keyfinder-cli; \
      cmake -S /tmp/keyfinder-cli -B /tmp/keyfinder-cli/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local; \
      cmake --build /tmp/keyfinder-cli/build --parallel 2; \
      cmake --install /tmp/keyfinder-cli/build; \
      rm -rf /tmp/libkeyfinder /tmp/keyfinder-cli; \
    else \
      echo "KeyFinder CLI disabled. Remove ENABLE_KEYFINDER=false to enable optional GPLv3 keyfinder."; \
    fi

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
