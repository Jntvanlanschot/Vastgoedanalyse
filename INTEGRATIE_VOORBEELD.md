# Integratie Voorbeeld: Hoe de API gebruiken vanaf je website

## Stap 1: API Key instellen

Voeg de API key toe aan je `.env.local`:

```env
API_KEY=your-super-secret-api-key-minimum-32-characters-long
```

**⚠️ Belangrijk:** Gebruik een sterke, unieke API key (minimaal 32 karakters).

---

## Stap 2: API aanroepen vanaf je website

### Optie A: Vanaf je backend server (Aanbevolen)

```javascript
// Node.js/Express voorbeeld
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/api/analyze-property', upload.array('realworksFiles', 5), async (req, res) => {
  try {
    const { referenceData, csvData } = req.body;
    const realworksFiles = req.files;
    
    // Maak FormData voor de API
    const formData = new FormData();
    
    // Voeg reference data toe
    formData.append('referenceData', JSON.stringify({
      address_full: referenceData.address_full,
      area_m2: parseFloat(referenceData.area_m2),
      energy_label: referenceData.energy_label,
      bedrooms: parseInt(referenceData.bedrooms),
      bathrooms: parseInt(referenceData.bathrooms),
      rooms: parseInt(referenceData.rooms),
      has_terrace: referenceData.has_terrace === 'true',
      has_balcony: referenceData.has_balcony === 'true',
      has_garden: referenceData.has_garden === 'true',
      sun_orientation: referenceData.sun_orientation || 'Zuid'
    }));
    
    // Voeg CSV data toe
    formData.append('csvData', csvData);
    
    // Voeg Realworks bestanden toe
    realworksFiles.forEach((file, index) => {
      formData.append(`realworks_file_${index + 1}`, fs.createReadStream(file.path), {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });
    
    // Roep de API aan
    const response = await fetch('https://jouw-domein.nl/api/upload-realworks-public', {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.VASTGOEDTOOL_API_KEY // Server-side environment variable
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }
    
    const result = await response.json();
    
    // Stuur resultaat terug naar frontend
    res.json({
      success: true,
      result: result,
      downloadUrls: {
        pdf: `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.pdf}&apiKey=${process.env.VASTGOEDTOOL_API_KEY}`,
        excel: `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.excel}&apiKey=${process.env.VASTGOEDTOOL_API_KEY}`,
        csv: result.artifacts.csv ? `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.csv}&apiKey=${process.env.VASTGOEDTOOL_API_KEY}` : null
      }
    });
    
  } catch (error) {
    console.error('Error calling analysis API:', error);
    res.status(500).json({ error: 'Failed to analyze property' });
  }
});
```

### Optie B: Direct vanaf frontend (JavaScript)

```javascript
// Vanaf je frontend (client-side)
async function analyzeProperty(referenceData, csvData, realworksFiles) {
  const formData = new FormData();
  
  // Voeg reference data toe
  formData.append('referenceData', JSON.stringify({
    address_full: referenceData.address_full,
    area_m2: referenceData.area_m2,
    energy_label: referenceData.energy_label,
    bedrooms: referenceData.bedrooms,
    bathrooms: referenceData.bathrooms,
    rooms: referenceData.rooms,
    has_terrace: referenceData.has_terrace,
    has_balcony: referenceData.has_balcony,
    has_garden: referenceData.has_garden,
    sun_orientation: referenceData.sun_orientation || 'Zuid'
  }));
  
  // Voeg CSV data toe
  formData.append('csvData', csvData);
  
  // Voeg Realworks bestanden toe
  realworksFiles.forEach((file, index) => {
    formData.append(`realworks_file_${index + 1}`, file);
  });
  
  try {
    const response = await fetch('https://jouw-domein.nl/api/upload-realworks-public', {
      method: 'POST',
      headers: {
        'X-API-Key': 'your-api-key-here' // ⚠️ Let op: dit is zichtbaar in de browser!
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Download PDF
      const pdfUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.pdf}&apiKey=your-api-key-here`;
      window.open(pdfUrl, '_blank');
      
      // Download Excel
      const excelUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.excel}&apiKey=your-api-key-here`;
      window.open(excelUrl, '_blank');
      
      return result;
    } else {
      throw new Error(result.message || 'Analysis failed');
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Gebruik
const referenceData = {
  address_full: 'Schipbeekstraat 40 2, 1078 XR Amsterdam, Nederland',
  area_m2: 65,
  energy_label: 'C',
  bedrooms: 3,
  bathrooms: 1,
  rooms: 3,
  has_terrace: false,
  has_balcony: true,
  has_garden: false,
  sun_orientation: 'Zuid'
};

const csvData = '...'; // CSV data van Funda scraping
const realworksFiles = [...]; // Array van File objecten

analyzeProperty(referenceData, csvData, realworksFiles)
  .then(result => {
    console.log('Analysis complete:', result);
  })
  .catch(error => {
    console.error('Analysis failed:', error);
  });
```

### Optie C: PHP voorbeeld

```php
<?php
// PHP voorbeeld
function analyzeProperty($referenceData, $csvData, $realworksFiles) {
    $apiKey = getenv('VASTGOEDTOOL_API_KEY');
    $apiUrl = 'https://jouw-domein.nl/api/upload-realworks-public';
    
    $ch = curl_init($apiUrl);
    
    $postData = [
        'referenceData' => json_encode($referenceData),
        'csvData' => $csvData
    ];
    
    // Voeg files toe
    foreach ($realworksFiles as $index => $file) {
        $postData['realworks_file_' . ($index + 1)] = new CURLFile($file['path'], $file['mime'], $file['name']);
    }
    
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-API-Key: ' . $apiKey
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        return json_decode($response, true);
    } else {
        throw new Exception('API call failed: ' . $response);
    }
}

// Gebruik
$referenceData = [
    'address_full' => 'Schipbeekstraat 40 2, 1078 XR Amsterdam, Nederland',
    'area_m2' => 65,
    'energy_label' => 'C',
    'bedrooms' => 3,
    'bathrooms' => 1,
    'rooms' => 3,
    'has_terrace' => false,
    'has_balcony' => true,
    'has_garden' => false,
    'sun_orientation' => 'Zuid'
];

$csvData = '...'; // CSV data
$realworksFiles = [
    ['path' => '/path/to/file1.rtf', 'mime' => 'application/rtf', 'name' => 'file1.rtf'],
    ['path' => '/path/to/file2.rtf', 'mime' => 'application/rtf', 'name' => 'file2.rtf']
];

try {
    $result = analyzeProperty($referenceData, $csvData, $realworksFiles);
    echo "Analysis complete!\n";
    echo "PDF: " . $result['artifacts']['pdf'] . "\n";
    echo "Excel: " . $result['artifacts']['excel'] . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
```

### Optie D: Python voorbeeld

```python
import requests
import os

def analyze_property(reference_data, csv_data, realworks_files):
    api_key = os.getenv('VASTGOEDTOOL_API_KEY')
    api_url = 'https://jouw-domein.nl/api/upload-realworks-public'
    
    # Maak FormData
    files = {}
    for i, file_path in enumerate(realworks_files, start=1):
        files[f'realworks_file_{i}'] = open(file_path, 'rb')
    
    data = {
        'referenceData': json.dumps(reference_data),
        'csvData': csv_data
    }
    
    headers = {
        'X-API-Key': api_key
    }
    
    response = requests.post(api_url, files=files, data=data, headers=headers)
    
    # Sluit files
    for f in files.values():
        f.close()
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f'API call failed: {response.text}')

# Gebruik
reference_data = {
    'address_full': 'Schipbeekstraat 40 2, 1078 XR Amsterdam, Nederland',
    'area_m2': 65,
    'energy_label': 'C',
    'bedrooms': 3,
    'bathrooms': 1,
    'rooms': 3,
    'has_terrace': False,
    'has_balcony': True,
    'has_garden': False,
    'sun_orientation': 'Zuid'
}

csv_data = '...'  # CSV data
realworks_files = ['/path/to/file1.rtf', '/path/to/file2.rtf']

try:
    result = analyze_property(reference_data, csv_data, realworks_files)
    print("Analysis complete!")
    print(f"PDF: {result['artifacts']['pdf']}")
    print(f"Excel: {result['artifacts']['excel']}")
except Exception as e:
    print(f"Error: {e}")
```

---

## Response Format

### Succesvolle Response

```json
{
  "status": "success",
  "message": "Workflow completed successfully",
  "summary": {
    "total_funda_records": 150,
    "realworks_records": 28,
    "matched_records": 28,
    "top_15_matches": 15,
    "pdf_file": "outputs\\top15_perfect_report_final.pdf",
    "excel_file": "outputs\\top15_perfecte_woningen_tabel_final.xlsx"
  },
  "artifacts": {
    "pdf": "outputs\\top15_perfect_report_final.pdf",
    "excel": "outputs\\top15_perfecte_woningen_tabel_final.xlsx",
    "csv": "outputs\\top15_perfect_matches_final.csv"
  },
  "step1_result": { ... },
  "step2_result": { ... },
  "step3_result": { ... },
  "step4_result": { ... }
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Error description here",
  "step1_result": null,
  "step2_result": null,
  "step3_result": null,
  "step4_result": null
}
```

---

## Bestanden Downloaden

Na een succesvolle analyse kun je de bestanden downloaden:

```javascript
// PDF downloaden
const pdfUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.pdf}&apiKey=your-api-key`;

// Excel downloaden
const excelUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.excel}&apiKey=your-api-key`;

// CSV downloaden (indien beschikbaar)
const csvUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.csv}&apiKey=your-api-key`;
```

---

## Security Best Practices

1. **Gebruik altijd HTTPS** voor API calls
2. **Bewaar API keys server-side**, niet in client-side code
3. **Roteer API keys** regelmatig
4. **Monitor API usage** voor verdachte activiteit
5. **Gebruik rate limiting** op je eigen server

---

## Troubleshooting

### Error: "Unauthorized: Invalid or missing API key"
- Controleer of `API_KEY` is ingesteld in `.env.local`
- Controleer of de API key correct wordt meegestuurd in de header `X-API-Key`
- Controleer of er geen extra spaties zijn in de API key

### Error: "Reference data is required"
- Zorg ervoor dat `referenceData` als JSON string wordt meegestuurd
- Controleer of alle verplichte velden aanwezig zijn

### Error: "At least 1 Realworks file is required"
- Zorg ervoor dat minimaal 1 Realworks bestand (.rtf) wordt meegestuurd
- Controleer of de bestandsnamen correct zijn (`realworks_file_1`, `realworks_file_2`, etc.)

### Error: "CSV data is required"
- Zorg ervoor dat `csvData` als string wordt meegestuurd
- Dit moet de CSV data zijn van de Funda scraping

---

## Vragen?

Als je hulp nodig hebt met de integratie, laat het weten!



