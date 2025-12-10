# 🐍 Vercel Python Setup - Complete Gids

## Probleem
Vercel installeert Python dependencies niet automatisch. De JSON parsing error komt omdat Python scripts niet kunnen draaien zonder dependencies.

## Oplossing: Python Dependencies Installeren

Vercel heeft Python beschikbaar in serverless functions, maar dependencies moeten worden geïnstalleerd. Er zijn twee manieren:

---

## Methode 1: Install Script in API Route (Aanbevolen)

Python dependencies installeren tijdens runtime (eerste keer dat de API wordt aangeroepen).

### Stap 1: Maak Install Script

Maak `apps/workflow-py/install_dependencies.py`:

```python
#!/usr/bin/env python3
import subprocess
import sys
import os

def install_dependencies():
    """Install Python dependencies if not already installed"""
    requirements_file = os.path.join(os.path.dirname(__file__), 'requirements.txt')
    
    if not os.path.exists(requirements_file):
        print(f"Requirements file not found: {requirements_file}")
        return False
    
    try:
        # Check if dependencies are already installed
        import pandas
        import reportlab
        # If we get here, main dependencies are installed
        print("Dependencies already installed")
        return True
    except ImportError:
        print("Installing Python dependencies...")
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-r', requirements_file],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("Dependencies installed successfully")
            return True
        else:
            print(f"Error installing dependencies: {result.stderr}")
            return False

if __name__ == '__main__':
    install_dependencies()
```

### Stap 2: Update API Route

Pas `app/api/upload-realworks/route.ts` aan om dependencies te installeren voordat Python script draait.

---

## Methode 2: Vercel Buildpack (Alternatief)

Vercel ondersteunt buildpacks voor Python, maar dit werkt alleen als je een Python serverless function maakt.

---

## Methode 3: Pre-install in Build (Huidige Aanpak)

De `vercel.json` heeft al een buildCommand met pip3 install, maar dit werkt mogelijk niet omdat Python niet beschikbaar is tijdens build.

### Check Build Logs

1. Ga naar Vercel Dashboard → Deployments
2. Klik op je laatste deployment
3. Klik op "Build Logs"
4. Zoek naar:
   - "pip3: command not found" → Python niet beschikbaar tijdens build
   - "Installing Python dependencies..." → Check of dit werkt
   - Python errors → Check welke dependencies ontbreken

---

## Snelle Fix: Runtime Install Script

Laat me een script maken dat automatisch dependencies installeert tijdens runtime:



