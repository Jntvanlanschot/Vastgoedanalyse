# Prompt voor ChatGPT: Optimale Prijsberekening op Basis van Similarity Scores

## Context: Vastgoed Taxatie Tool - Complete Systeem Uitleg

Wij hebben een volledig geautomatiseerd vastgoed taxatie systeem ontwikkeld dat vergelijkbare woningen vindt voor een referentie woning en daarop een taxatiewaarde berekent. Hier is een complete uitleg van hoe het hele systeem werkt:

## Complete Workflow Overzicht

### Stap 1: Adres Invoer en Geocoding
De gebruiker voert een referentie adres in (bijv. "Eerste Laurierdwarsstraat 18 B, Amsterdam"). Het systeem:
- Geocodeert het adres via Google Maps API (of OpenStreetMap Nominatim als fallback)
- Bepaalt de buurt/wijk op basis van coördinaten
- Haalt de referentie woning eigenschappen op (oppervlakte, energielabel, slaapkamers, etc.)

### Stap 2: Data Verzameling
Het systeem scrapet automatisch verkochte woningen uit dezelfde buurt via Funda.nl:
- Gebruikt Apify scraper om tot 150 verkochte woningen te verzamelen
- Filtert op beschikbaarheid (verkocht, onder bod)
- Slaat alle woningdata op in CSV formaat

### Stap 3: Straat Matching (Algorithm 1)
Voor de referentie straat vinden we de meest vergelijkbare straten:
- Gebruikt OpenStreetMap (OSM) om straatnamen te matchen
- Berekenen similarity scores tussen straten (bijv. "Eerste Laurierdwarsstraat" vs "Tweede Laurierdwarsstraat")
- Selecteren de TOP 5 meest vergelijkbare straten
- Filteren straten met minimaal 3 woningen

### Stap 4: Realworks Data Integratie
Optioneel kunnen gebruikers Realworks RTF bestanden uploaden met aanvullende verkoopdata:
- Parseert RTF bestanden met woningdetails
- Extraheert adres, prijs, oppervlakte, energielabel, etc.
- Voegt deze data toe aan de dataset

### Stap 5: Woning Matching (Algorithm 2) - Het Kernproces

Voor een referentie woning (bijv. "Eerste Laurierdwarsstraat 18 B, Amsterdam, 146 m², energielabel C, 3 slaapkamers") zoeken we in de verzamelde database naar de meest vergelijkbare panden. We gebruiken een **similarity score algoritme** dat verschillende factoren weegt:

- **Energielabel** (40% gewicht - leidende factor)
- Oppervlakte (m²)
- Aantal slaapkamers
- Aantal badkamers
- Aantal kamers
- Buitenruimte (tuin/balkon/terras)
- Locatie (straat matching via OpenStreetMap)
- Onderhoudsstaat

De similarity score is een waarde tussen 0 en 1, waarbij:
- **1.0** = perfecte match (identieke woning)
- **0.7-0.9** = zeer goede match
- **0.5-0.7** = redelijke match
- **<0.5** = zwakke match

### Stap 6: Top 15 Selectie
- Sorteert alle matches op similarity score (hoogste eerst)
- Selecteert de TOP 15 meest vergelijkbare woningen
- Filtert exacte matches (dezelfde woning) eruit
- Werkt ook met minder dan 15 matches (bijv. 6-8 woningen)

### Stap 7: Rapport Generatie
Het systeem genereert automatisch:
- **PDF Rapport**: Professioneel rapport met referentie woning, adviesprijs, en gedetailleerde vergelijking per woning
- **Excel Bestand**: Tabel met alle TOP 15 matches, scores, en prijzen
- **CSV Export**: Ruwe data voor verdere analyse

---

## 2. Huidige Prijsberekening

We selecteren de **TOP 10** meest vergelijkbare woningen (hoogste similarity scores) en berekenen de adviesprijs als volgt:

1. Voor elke woning in de TOP 10:
   - Bereken prijs per m²: `verkoopprijs / oppervlakte_m²`
   - Gebruik de similarity score als **weight** voor deze prijs

2. Bereken gewogen gemiddelde prijs per m²:
   ```
   gewogen_avg_prijs_per_m2 = Σ(prijs_per_m2_i × score_i) / Σ(score_i)
   ```

3. Bereken adviesprijs voor referentie woning:
   ```
   adviesprijs = gewogen_avg_prijs_per_m2 × oppervlakte_referentie_woning
   ```

### 3. Voorbeeld

Stel we hebben deze TOP 3 matches:
- Woning A: €800.000, 100 m², score 0.85 → €8.000/m²
- Woning B: €750.000, 90 m², score 0.75 → €8.333/m²  
- Woning C: €700.000, 95 m², score 0.65 → €7.368/m²

Huidige berekening:
- Gewogen gemiddelde: (8000×0.85 + 8333×0.75 + 7368×0.65) / (0.85+0.75+0.65) = €7.978/m²
- Voor referentie woning van 146 m²: €7.978 × 146 = **€1.164.788**

### 4. Onze Vraag

**Is deze methode optimaal, of zijn er betere manieren om de similarity score te gebruiken in de prijsberekening?**

Specifieke vragen:
1. **Moeten we de similarity score direct als weight gebruiken, of is er een betere transformatie?** (bijv. score², log(score), of een andere functie)
2. **Moeten we een minimum threshold hanteren?** (bijv. alleen woningen met score > 0.6 meenemen)
3. **Moeten we outliers verwijderen?** (bijv. woningen met extreem hoge/lage prijs per m²)
4. **Is er een betere aggregatie methode dan gewogen gemiddelde?** (bijv. mediaan, trimmed mean, of een andere statistische methode)
5. **Moeten we de score gebruiken als multiplier in plaats van weight?** (bijv. `prijs × (1 + score_factor)`)
6. **Zijn er andere factoren die we moeten meewegen?** (bijv. verkoopdatum, marktontwikkeling, seizoensinvloeden)

### 5. Technische Details

**Data Bronnen:**
- Funda.nl scraping (verkochte woningen, tot 150 per buurt)
- Realworks RTF bestanden (optioneel, aanvullende verkoopdata)
- OpenStreetMap (voor straat matching en locatie data)

**Algoritmes:**
- **Algorithm 1**: Straat matching via OSM similarity (string matching + geografische afstand)
- **Algorithm 2**: Woning matching via multi-factor similarity score

**Output:**
- PDF rapport met adviesprijs en gedetailleerde vergelijkingen
- Excel bestand met alle matches
- JSON API responses voor web integratie

### 6. Aanvullende Context

- We werken met **verkochte woningen** (niet vraagprijzen) - dit zijn echte transactieprijzen
- De database bevat woningen uit dezelfde buurt/straat (geografisch beperkt)
- We hebben typisch 5-15 matches per referentie woning (soms minder, soms meer)
- De similarity scores variëren meestal tussen 0.4 en 0.9
- Scores onder 0.4 worden meestal niet meegenomen (te zwakke match)
- We willen een **realistische taxatiewaarde** geven die rekening houdt met de mate van overeenkomst
- Het systeem wordt gebruikt door vastgoed professionals voor taxaties

### 7. Onze Specifieke Vraag

**Is onze huidige methode (gewogen gemiddelde op basis van similarity score) optimaal, of zijn er betere manieren om de similarity score te gebruiken in de prijsberekening?**

We zijn vooral geïnteresseerd in:
- Of de similarity score direct als weight moet worden gebruikt, of dat er een betere transformatie is
- Of we een minimum threshold moeten hanteren voor matches die meegenomen worden
- Of we outliers moeten verwijderen (extreem hoge/lage prijzen per m²)
- Of er betere aggregatie methoden zijn dan gewogen gemiddelde
- Of de score als multiplier moet worden gebruikt in plaats van weight
- Of er andere factoren zijn die we moeten meewegen (verkoopdatum, marktontwikkeling, etc.)

**Wat is volgens jou de beste methode om de similarity score te gebruiken voor een accurate en betrouwbare prijsberekening?**

