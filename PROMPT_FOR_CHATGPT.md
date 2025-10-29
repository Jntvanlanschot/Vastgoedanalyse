# Prompt voor ChatGPT: Real Estate Matching Algorithm Weights Optimalisatie

Stel deze vraag aan ChatGPT:

---

Ik heb een real estate matching algoritme dat vergelijkbare panden voor taxatiedoeleinden vindt. Ik wil dat je me helpt de ideale weights te bepalen voor de scoring componenten. Hier is de context:

## Wat doet het systeem?
- Een gebruiker voert een referentiepand in (bijv. "Eerste Laurierdwarsstraat 18B, Amsterdam")
- Het systeem vindt de 15 meest vergelijkbare panden uit een database van Realworks data (verkochte panden)
- Deze 15 panden worden gebruikt om een adviesprijs te berekenen (gemiddelde prijs per m² van top 10 × oppervlakte referentiepand)

## Huidige Scoring Componenten en Weights:

1. **Straat naam match** (5%): String similarity tussen straatnamen
2. **OSM straat similarity** (18%): OpenStreetMap data matching (snelheid, breedte, type, etc.)
3. **Oppervlakte proximity** (35%): Hoe dichtbij de m² is van het referentiepand
4. **Buurt/Locatie proximity** (2%): Neighbourhood similarity
5. **Tuin match** (15%): Heeft het pand tuin (ja/nee match)?
6. **Kamers similarity** (5%): Aantal kamers proximity
7. **Slaapkamers similarity** (5%): Aantal slaapkamers proximity
8. **Balkon/Terras match** (11%): Heeft het pand balkon of terras (ja/nee match)?
9. **Energielabel similarity** (4%): Energy label proximity

**Totaal: 100%**

## Het Probleem:
- Het systeem schat de waarde momenteel te HOOG uit (ongeveer 20% te duur)
- We willen dat goedkopere panden per m² hoger in de ranking komen
- We willen dat de adviesprijs realistischer (lager) wordt

## Strategie tot nu toe:
- We hebben oppervlakte op 35% gezet (meest belangrijke factor)
- We hebben features (tuin/balkon) op 30% gezet (goedkoper huis zonder tuin/balkon moet niet matchen met huis met tuin/balkon)
- We hebben locatie wat verlaagd (locatie kost geld)

## Vraag aan jou:
1. **Analyseer de huidige weight verdeling** - is de 35% voor oppervlakte te hoog? Te laag?
2. **Geef een nieuwe weight verdeling** die ervoor zorgt dat:
   - Vergelijkbare panden (qua features en oppervlakte) boven komen
   - Panden met verschillende features (tuin vs geen tuin) lager scoren
   - Kleinere/lagdere panden die toch vergelijkbaar zijn hoger ranken
   - De uiteindelijke adviesprijs realistischer wordt
3. **Leg uit waarom** jouw verdeling logisch is vanuit een taxatie-perspectief

Let op: De weights moeten optellen tot exact 100%. Alle 9 componenten moeten een percentage hebben.

Mijn huidige setup:
- Referentiepand: appartement, ~80-100m², geen tuin, geen balkon
- De top matches moeten vergelijkbaar zijn (ook geen tuin/balkon, vergelijkbare oppervlakte)
- Het adviesprijs moet realistisch zijn (niet te hoog)

Wat is de beste weight verdeling volgens jou? En waarom?

