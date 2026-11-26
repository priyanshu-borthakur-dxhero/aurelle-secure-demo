FROM python:3.12-alpine
WORKDIR /app
COPY requirements.txt ./
RUN apk upgrade --no-cache && pip install --no-cache-dir -r requirements.txt
COPY app.py ./
RUN adduser -S -H app
USER app
EXPOSE 8091
CMD ["python", "app.py"]
