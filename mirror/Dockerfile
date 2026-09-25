FROM python:3.12-alpine
WORKDIR /app
COPY server.py .
RUN adduser -D hex && mkdir /data && chown hex:hex /data
USER hex
ENV HEX_MIRROR_DB=/data/hex.sqlite3 PORT=8997
EXPOSE 8997
CMD ["python", "-u", "server.py"]
