# Deployment Guide

This guide covers deploying the Video Translation system to production, including the NestJS API, Next.js frontend, and Python worker.

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Backend (NestJS) Deployment](#backend-nestjs-deployment)
3. [Frontend (Next.js) Deployment](#frontend-nextjs-deployment)
4. [Worker (Python/Colab) Deployment](#worker-pythoncolab-deployment)
5. [Database & Infrastructure](#database--infrastructure)
6. [Monitoring & Logging](#monitoring--logging)

---

## Pre-Deployment Checklist

Before deploying to production, ensure:

### Security
- [ ] `.env` files are NOT committed to git (use `.gitignore`)
- [ ] `SARVAM_API_KEY` is stored in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] `WORKER_SECRET` is rotated and strong (32+ chars)
- [ ] API endpoints are behind HTTPS (use reverse proxy like Nginx)
- [ ] CORS is restricted to specific domains (not `*`)
- [ ] Database password is strong and unique
- [ ] Redis has a password set (`REDIS_PASSWORD`)

### Performance
- [ ] Database indexes are created (see `infra/postgres/init.sql`)
- [ ] Redis is configured for persistence (`appendonly yes` in redis.conf)
- [ ] CDN is set up for static assets (Next.js exports to `.next/static`)
- [ ] Job retention policy is set (`JOB_RETENTION_DAYS`)

### Reliability
- [ ] PostgreSQL backups are scheduled daily
- [ ] Redis data is persisted to disk
- [ ] Dead-letter queue is configured for BullMQ
- [ ] Health check endpoints are monitored
- [ ] Error logging and alerting is set up

---

## Backend (NestJS) Deployment

### Option 1: Docker (Recommended)

#### 1. Build Docker Image
```bash
cd apps/api

# Multi-stage build to minimize image size
docker build -t video-translation-api:latest \
  --build-arg NODE_ENV=production \
  -f Dockerfile .
```

#### 2. Example Dockerfile
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main"]
```

#### 3. Deploy to Kubernetes
```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-translation-api
spec:
  replicas: 2  # Horizontal scaling
  selector:
    matchLabels:
      app: video-translation-api
  template:
    metadata:
      labels:
        app: video-translation-api
    spec:
      containers:
      - name: api
        image: myregistry/video-translation-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: video-translation-secrets
              key: database-url
        - name: SARVAM_API_KEY
          valueFrom:
            secretKeyRef:
              name: video-translation-secrets
              key: sarvam-api-key
        - name: WORKER_SECRET
          valueFrom:
            secretKeyRef:
              name: video-translation-secrets
              key: worker-secret
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

#### 4. Helm Chart (Optional)
```bash
# Create Helm chart
helm create video-translation

# Deploy
helm install video-translation ./video-translation \
  --values values-production.yaml \
  --namespace production
```

### Option 2: Traditional VPS (DigitalOcean, AWS EC2, Hetzner)

#### 1. Server Setup
```bash
# SSH into server
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install nodejs -y

# Install PostgreSQL
apt install postgresql postgresql-contrib -y

# Install Redis
apt install redis-server -y

# Install Nginx (reverse proxy)
apt install nginx -y
```

#### 2. Clone Repository
```bash
cd /opt
git clone https://github.com/yourusername/Video-Translation-with-NestJS.git
cd Video-Translation-with-NestJS
```

#### 3. Install Dependencies & Build
```bash
cd apps/api
npm ci  # Clean install (respects package-lock.json)
npm run build
```

#### 4. Configure PM2 (Process Manager)
```bash
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'video-translation-api',
      script: './dist/main.js',
      instances: 2,  # Or 'max' for all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      max_memory_restart: '512M',
    }
  ]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

#### 5. Configure Nginx (Reverse Proxy)
```nginx
# /etc/nginx/sites-available/video-translation
upstream api {
  server localhost:3000;
  server localhost:3001;  # If running multiple instances
}

server {
  listen 80;
  server_name api.example.com;

  # Redirect HTTP to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;

  # SSL certificates (use Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;

  # Proxy to NestJS
  location / {
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # SSE streaming (events endpoint)
  location /api/events {
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/video-translation /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### 6. Set Up SSL with Let's Encrypt
```bash
apt install certbot python3-certbot-nginx -y
certbot certonly --nginx -d api.example.com

# Auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer
```

#### 7. Database Backup
```bash
# Create backup script
cat > /opt/backup-database.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete
EOF

chmod +x /opt/backup-database.sh

# Schedule daily at 2 AM
crontab -e
# Add: 0 2 * * * /opt/backup-database.sh
```

---

## Frontend (Next.js) Deployment

### Option 1: Vercel (Recommended for Next.js)

1. **Push code to GitHub**
2. **Connect repository to Vercel:**
   - Visit https://vercel.com/new
   - Select your repo
   - Set environment variables:
     ```
     NEXT_PUBLIC_API_URL = https://api.example.com/api
     ```
3. **Deploy:** Vercel auto-deploys on push to main

### Option 2: Self-Hosted

#### 1. Build Static Export
```bash
cd apps/web

# Update next.config.ts for static export
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",  // Enable static export
  images: {
    unoptimized: true,  // Required for static export
  },
};

export default nextConfig;
EOF

# Build
npm run build

# Output is in ./out directory
```

#### 2. Serve with Nginx
```nginx
server {
  listen 443 ssl http2;
  server_name example.com;

  root /var/www/video-translation-web;
  index index.html;

  # SSL config (same as API)
  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  # Cache static assets
  location /_next/static {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Rewrite SPA routes to index.html
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

#### 3. Deploy Script
```bash
#!/bin/bash
cd /opt/Video-Translation-with-NestJS/apps/web
git pull origin main
npm ci
npm run build
cp -r out/* /var/www/video-translation-web/
systemctl restart nginx
```

---

## Worker (Python/Colab) Deployment

### Option 1: Google Colab (Easiest)

1. Upload `main_video_translation_pipeline.ipynb` to Google Colab
2. Run cells 1–2 for setup
3. Configure Colab Secrets:
   - `SARVAM_API_KEY`
   - `NESTJS_URL` (your API domain with HTTPS)
   - `WORKER_SECRET`
4. Run Cell E (worker loop) to start polling

**Pros:** Free GPU (T4), no infrastructure needed
**Cons:** Requires manual restart after timeout

### Option 2: AWS EC2 with GPU

#### 1. Launch GPU Instance
```bash
# Use Deep Learning AMI with CUDA pre-installed
# Instance: g4dn.xlarge or g4dn.2xlarge (T4 GPU)

# Connect and verify GPU
nvidia-smi
```

#### 2. Install Dependencies
```bash
# Python environment
python3 -m venv /opt/venv
source /opt/venv/bin/activate

# Clone repo
git clone https://github.com/yourusername/Video-Translation-with-NestJS.git
cd Video-Translation-with-NestJS/apps/worker

# Install Python packages
pip install -r requirements.txt
```

#### 3. Run Worker with Systemd
```ini
# /etc/systemd/system/video-translation-worker.service
[Unit]
Description=Video Translation Worker
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/Video-Translation-with-NestJS
Environment="SARVAM_API_KEY=sk_xxx"
Environment="NESTJS_URL=https://api.example.com"
Environment="WORKER_SECRET=your-secret"
ExecStart=/opt/venv/bin/python apps/worker/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
systemctl enable video-translation-worker
systemctl start video-translation-worker
systemctl status video-translation-worker
```

### Option 3: Modal Labs (Serverless GPU)

```python
# Deploy to Modal Labs for serverless scaling
import modal

app = modal.App()

gpu = modal.gpu.A40()  # Or T4
image = modal.Image.debian_slim().pip_install(...dependencies...)

@app.function(image=image, gpu=gpu, timeout=3600, keep_warm=1)
def run_worker():
    # Worker polling loop
    pass

if __name__ == "__main__":
    run_worker()
```

Deploy:
```bash
modal deploy worker.py
```

---

## Database & Infrastructure

### PostgreSQL Production Setup

#### 1. RDS (AWS Managed)
```bash
# Create RDS instance via AWS Console or CLI
aws rds create-db-instance \
  --db-instance-identifier video-translation-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --allocated-storage 100 \
  --master-username postgres \
  --master-user-password $(openssl rand -base64 32) \
  --backup-retention-period 30 \
  --multi-az  # For high availability
```

#### 2. Self-Hosted on VPS
```bash
# Install PostgreSQL
apt install postgresql postgresql-contrib -y

# Configure for production
sudo -u postgres psql << 'EOF'
CREATE DATABASE video_translation;
CREATE USER app_user WITH PASSWORD 'strong_password_here';
GRANT CONNECT ON DATABASE video_translation TO app_user;

-- Enable required extensions
\connect video_translation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables (see infra/postgres/init.sql)
EOF

# Configure postgresql.conf for production
sudo nano /etc/postgresql/*/main/postgresql.conf
# Key settings:
# max_connections = 200
# shared_buffers = 256MB (25% of RAM)
# effective_cache_size = 1GB (50% of RAM)
# work_mem = 4MB
# checkpoint_completion_target = 0.9
# wal_buffers = 16MB
# default_statistics_target = 100

systemctl restart postgresql
```

### Redis Production Setup

```bash
# Install Redis from source (latest)
curl -fsSL https://download.redis.io/redis-stable.tar.gz | tar xz
cd redis-stable
make
make test
sudo make install

# Configure redis.conf
sudo cp redis.conf /etc/redis/
sudo nano /etc/redis/redis.conf
# Key settings:
# requirepass strong_password_here
# appendonly yes
# appendfsync everysec
# maxmemory 2gb
# maxmemory-policy allkeys-lru

# Start service
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### MinIO S3-Compatible Storage
```bash
# Install MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
./minio server /minio-data --console-address :9001

# Access console at http://localhost:9001
# Create bucket "video-translation"
# Create access key pair
```

---

## Monitoring & Logging

### Application Monitoring

```bash
# Install Prometheus exporter (optional)
npm install prometheus-client

# Example metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
```

### Structured Logging (Already configured with Pino)

```bash
# Logs are saved to disk (if configured)
tail -f /var/log/video-translation-api/app.log

# Parse with jq for specific events
cat app.log | jq 'select(.level==50)' # ERROR level only
```

### Alerting Setup (Example with Prometheus + Alertmanager)

```yaml
# alerts.yml
groups:
- name: video_translation
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 5m
    annotations:
      summary: "High error rate detected"
  
  - alert: WorkerDown
    expr: up{job="video-translation-worker"} == 0
    for: 5m
    annotations:
      summary: "Worker is down"
```

### Health Checks

```bash
# API health check endpoint
curl https://api.example.com/api/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-12-01T10:30:00Z"
}
```

---

## Common Deployment Issues

### Issue: "Cannot connect to database"
```bash
# Check connection string format
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check security groups (AWS) or firewall rules
```

### Issue: "Presigned URLs return 403"
```bash
# Verify S3/MinIO credentials
aws s3 ls --profile=default

# Check bucket policy allows presigned URL generation
# Verify timestamp on server/client are synced (NTP)
```

### Issue: "Worker stuck in polling loop"
```bash
# Check worker logs
pm2 logs video-translation-worker

# Verify WORKER_SECRET matches API
echo $WORKER_SECRET

# Check API is reachable
curl -H "X-Worker-Secret: $WORKER_SECRET" https://api.example.com/api/worker/next-queued
```

---

## Rollback Strategy

### Zero-Downtime Deployment
```bash
# Using blue-green deployment
docker run -d --name api-green <new-image> -p 3001:3000
curl -f http://localhost:3001/health && \
  (nginx -s reload to point to port 3001) || \
  echo "Rollback"
docker rm api-blue
docker rename api-green api-blue
```

### Database Migration Rollback
```bash
# Keep migration versions
SELECT * FROM schema_migrations;

# Rollback to previous version
psql $DATABASE_URL -f infra/postgres/migrations/001_initial.sql
```

---

**Need help?** Check the main [README.md](../README.md) or open an issue on GitHub.
