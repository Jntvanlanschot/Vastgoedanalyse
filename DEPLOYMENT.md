# Deployment Gids - Vastgoedanalyse App

Deze gids legt uit hoe je de Vastgoedanalyse app kunt deployen en koppelen aan je eigen domein.

## Optie 1: Vercel (Aanbevolen - Meest Eenvoudig)

Vercel is gemaakt door de makers van Next.js en is de eenvoudigste optie.

### Stappen:

1. **Account aanmaken**
   - Ga naar [vercel.com](https://vercel.com) en maak een gratis account

2. **Project importeren**
   - Klik op "Add New Project"
   - Importeer je GitHub/GitLab repository of upload de code
   - Vercel detecteert automatisch dat het een Next.js project is

3. **Environment Variables instellen**
   - Ga naar Project Settings > Environment Variables
   - Voeg de volgende variabelen toe:
     ```
     APIFY_API_TOKEN=je_apify_token_hier
     JWT_SECRET=een_willekeurige_geheime_sleutel
     ```

4. **Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

5. **Domein koppelen**
   - Ga naar Project Settings > Domains
   - Klik op "Add Domain"
   - Voer je domein in (bijv. `vastgoedanalyse.nl`)
   - Volg de DNS instructies:
     - Voeg een CNAME record toe: `www` → `cname.vercel-dns.com`
     - Of een A record: `@` → Vercel IP adres (wordt getoond)

6. **SSL Certificate**
   - Vercel regelt automatisch SSL certificaten (HTTPS)
   - Dit gebeurt automatisch na DNS configuratie

### Voordelen:
- ✅ Gratis tier beschikbaar
- ✅ Automatische SSL
- ✅ Automatische deployments bij git push
- ✅ Edge functions voor snelle API routes
- ✅ Serverless functions (Python scripts moeten aangepast worden)

### Aandachtspunten:
- ⚠️ Python scripts moeten mogelijk aangepast worden voor serverless
- ⚠️ Bestandsuploads hebben limieten (50MB in config)
- ⚠️ Langlopende processen (>10s) hebben speciale configuratie nodig

---

## Optie 2: Eigen Server (VPS/Dedicated)

Voor volledige controle en Python script ondersteuning.

### Vereisten:
- VPS of dedicated server (bijv. DigitalOcean, Hetzner, AWS EC2)
- Ubuntu/Debian server
- Domein met DNS toegang

### Stappen:

1. **Server Setup**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 20+
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install Python 3.11+
   sudo apt install -y python3 python3-pip python3-venv
   
   # Install PM2 voor process management
   sudo npm install -g pm2
   
   # Install Nginx
   sudo apt install -y nginx
   ```

2. **App Deployen**
   ```bash
   # Clone repository
   cd /var/www
   git clone <jouw-repo-url> vastgoedanalyse
   cd vastgoedanalyse
   
   # Install dependencies
   npm install
   
   # Build app
   npm run build
   
   # Start met PM2
   pm2 start npm --name "vastgoedanalyse" -- start
   pm2 save
   pm2 startup
   ```

3. **Nginx Configuratie**
   ```bash
   sudo nano /etc/nginx/sites-available/vastgoedanalyse
   ```
   
   Voeg toe:
   ```nginx
   server {
       listen 80;
       server_name jouw-domein.nl www.jouw-domein.nl;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       
       # Increase timeouts for long-running Python scripts
       proxy_read_timeout 300s;
       proxy_connect_timeout 300s;
   }
   ```
   
   Activeer config:
   ```bash
   sudo ln -s /etc/nginx/sites-available/vastgoedanalyse /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **SSL met Let's Encrypt**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d jouw-domein.nl -d www.jouw-domein.nl
   ```

5. **Environment Variables**
   ```bash
   # Maak .env.local bestand
   nano /var/www/vastgoedanalyse/.env.local
   ```
   
   Voeg toe:
   ```
   APIFY_API_TOKEN=je_token
   JWT_SECRET=je_secret
   NODE_ENV=production
   ```

6. **DNS Configuratie**
   - Voeg A record toe: `@` → je server IP
   - Voeg A record toe: `www` → je server IP

### Voordelen:
- ✅ Volledige controle
- ✅ Python scripts werken zonder aanpassingen
- ✅ Geen limieten op bestandsgrootte
- ✅ Langlopende processen mogelijk

### Aandachtspunten:
- ⚠️ Je bent zelf verantwoordelijk voor security updates
- ⚠️ Server monitoring nodig
- ⚠️ Backups zelf regelen

---

## Optie 3: Docker + Cloud Provider

Containerized deployment voor betere isolatie.

### Dockerfile maken:
```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

### next.config.ts aanpassen:
```typescript
const nextConfig: NextConfig = {
  output: 'standalone', // Voeg dit toe
  // ... rest van config
};
```

### Deploy naar:
- **Railway**: railway.app (eenvoudig, goede Python support)
- **Render**: render.com (gratis tier beschikbaar)
- **Fly.io**: fly.io (goede performance)
- **DigitalOcean App Platform**: digitalocean.com

---

## Optie 4: Hybrid (Next.js op Vercel + Python API apart)

Voor beste van beide werelden.

1. **Next.js frontend** → Vercel
2. **Python API** → Eigen server of Railway/Render
3. **API calls** → Aanpassen naar externe Python API

### Aanpassingen nodig:
- Python scripts als aparte API server
- Next.js API routes aanpassen om externe API te callen
- CORS configuratie

---

## DNS Configuratie (Algemeen)

### Voor Vercel:
- **CNAME**: `www` → `cname.vercel-dns.com`
- **A Record**: `@` → Vercel IP (wordt getoond in dashboard)

### Voor Eigen Server:
- **A Record**: `@` → Server IP adres
- **A Record**: `www` → Server IP adres

### DNS Propagation:
- Kan 24-48 uur duren
- Check met: `dig jouw-domein.nl` of `nslookup jouw-domein.nl`

---

## Security Checklist

- [ ] SSL certificaat geïnstalleerd (HTTPS)
- [ ] Environment variables niet in code
- [ ] Firewall geconfigureerd (alleen 80, 443 open)
- [ ] Regular security updates
- [ ] Backups ingesteld
- [ ] Rate limiting op API routes
- [ ] Authentication/authorization gecontroleerd

---

## Monitoring & Maintenance

### Aanbevolen tools:
- **Uptime monitoring**: UptimeRobot (gratis)
- **Error tracking**: Sentry
- **Analytics**: Vercel Analytics of Google Analytics
- **Logs**: PM2 logs of CloudWatch

---

## Troubleshooting

### App werkt niet na deployment:
1. Check build logs
2. Check environment variables
3. Check server logs: `pm2 logs` of Vercel logs
4. Check DNS propagation

### Python scripts werken niet:
1. Check Python versie (3.11+)
2. Check dependencies: `pip install -r requirements.txt`
3. Check file permissions
4. Check werkdirectory paths

### SSL certificaat problemen:
1. Check DNS records
2. Wacht op propagation
3. Herhaal Let's Encrypt: `sudo certbot renew`

---

## Aanbevolen Setup voor Productie

**Voor deze app (met Python scripts):**
- **Optie 2 (Eigen Server)** of **Optie 3 (Docker)** is aanbevolen
- Vercel kan werken maar Python scripts moeten mogelijk aangepast worden

**Minimale Server Specificaties:**
- 2 CPU cores
- 4GB RAM
- 20GB storage
- Ubuntu 22.04 LTS

**Kosten indicatie:**
- VPS (DigitalOcean/Hetzner): €5-10/maand
- Vercel Pro: $20/maand (voor betere Python support)
- Domein: €10-15/jaar



