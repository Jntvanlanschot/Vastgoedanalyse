'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_WEIGHTS,
  SimilarityWeights,
  FeatureScores,
  combineFeatureScores,
} from '@/lib/workflow/calculateSimilarity';

interface TuningCandidate {
  address_full: string;
  street: string;
  city: string;
  rw_sale_price: number | null;
  rw_ask_price: number | null;
  rw_area_m2: number | null;
  rw_rooms: number | null;
  rw_bedrooms: number | null;
  rw_energy_label: string | null;
  rw_sale_date: string | null;
  rw_year_built: number | null;
  rw_has_garden: boolean;
  rw_has_balcony: boolean;
  rw_has_terrace: boolean;
  features: FeatureScores;
  default_score: number;
}

interface ReferenceForm {
  address: string;
  oppervlakte: number | '';
  kamers: number | '';
  energielabel: string;
  tuin: boolean;
  balkon: boolean;
}

const STORAGE_KEY = 'customSimilarityWeights';

// Base weights are normalized by their sum, so only ratios matter
const BASE_WEIGHT_KEYS: Array<{ key: keyof SimilarityWeights; label: string }> = [
  { key: 'weight_area', label: 'Oppervlakte' },
  { key: 'weight_distance', label: 'Afstand' },
  { key: 'weight_street_name', label: 'Straatnaam' },
  { key: 'weight_osm_street', label: 'OSM straat' },
  { key: 'weight_balcony', label: 'Balkon/terras' },
  { key: 'weight_sale_date', label: 'Verkoopdatum' },
  { key: 'weight_rooms', label: 'Kamers' },
  { key: 'weight_garden', label: 'Tuin' },
  { key: 'weight_year_built', label: 'Bouwjaar' },
];

function formatPrice(price: number | null): string {
  if (!price) return '—';
  return `€${price.toLocaleString('nl-NL')}`;
}

function formatScore(score: number): string {
  return (score * 100).toFixed(1) + '%';
}

export default function TuningPage() {
  const [reference, setReference] = useState<ReferenceForm>({
    address: '',
    oppervlakte: '',
    kamers: '',
    energielabel: 'B',
    tuin: false,
    balkon: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<TuningCandidate[] | null>(null);
  const [totalParsed, setTotalParsed] = useState(0);
  const [weights, setWeights] = useState<SimilarityWeights>({ ...DEFAULT_WEIGHTS });
  const [hasSavedWeights, setHasSavedWeights] = useState(false);
  const [showCount, setShowCount] = useState(15);
  const [copied, setCopied] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFromBlobs = async (
    referenceData: Record<string, unknown>,
    blobs: Array<{ url: string; name: string }>
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tuning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceData, blobs }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request mislukt (status ${response.status})`);
      }
      const data = await response.json();
      setCandidates(data.candidates || []);
      setTotalParsed(data.total_parsed || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis');
    } finally {
      setIsLoading(false);
    }
  };

  // Prefill reference from earlier steps and load previously saved weights
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setWeights({ ...DEFAULT_WEIGHTS, ...JSON.parse(saved) });
        setHasSavedWeights(true);
      }
    } catch (e) {
      console.error('Failed to load saved weights:', e);
    }

    try {
      const refStr = sessionStorage.getItem('referenceData');
      const propStr = localStorage.getItem('propertyData');
      if (refStr) {
        const ref = JSON.parse(refStr);
        setReference({
          address: ref.address_full || '',
          oppervlakte: ref.area_m2 || '',
          kamers: ref.rooms || '',
          energielabel: ref.energy_label || 'B',
          tuin: !!ref.has_garden,
          balkon: !!(ref.has_balcony || ref.has_terrace),
        });
      } else if (propStr) {
        const prop = JSON.parse(propStr);
        setReference({
          address: prop.address || '',
          oppervlakte: prop.oppervlakte || '',
          kamers: prop.kamers || '',
          energielabel: prop.energielabel || 'B',
          tuin: prop.tuin === 'Ja',
          balkon: prop.dakterras_balkon === 'Ja',
        });
      }
    } catch (e) {
      console.error('Failed to prefill reference data:', e);
    }

    // Reuse the Realworks upload from the last analysis, so tuning is iterative
    try {
      const blobsStr = sessionStorage.getItem('tuningBlobs');
      const refStr = sessionStorage.getItem('referenceData');
      if (blobsStr && refStr) {
        const blobs = JSON.parse(blobsStr);
        if (Array.isArray(blobs) && blobs.length > 0) {
          setAutoLoaded(true);
          fetchFromBlobs(JSON.parse(refStr), blobs);
        }
      }
    } catch (e) {
      console.error('Failed to auto-load tuning data from last analysis:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted = Array.from(fileList).filter(
      (f) => f.name.toLowerCase().endsWith('.mhtml') || f.name.toLowerCase().endsWith('.mht')
    );
    setFiles((prev) => [...prev, ...accepted].slice(0, 10));
    setError(null);
  };

  const buildReferenceData = () => {
    let geo: { lat?: number; lng?: number } = {};
    try {
      const geoStr = sessionStorage.getItem('addressGeo');
      if (geoStr) geo = JSON.parse(geoStr);
    } catch {
      // optional
    }
    return {
      address_full: reference.address.trim() || 'Onbekend adres',
      area_m2: reference.oppervlakte || 100,
      rooms: reference.kamers || 3,
      energy_label: reference.energielabel || 'B',
      has_garden: reference.tuin,
      has_balcony: reference.balkon,
      has_terrace: reference.balkon,
      latitude: geo.lat,
      longitude: geo.lng,
    };
  };

  const loadCandidates = async () => {
    if (files.length === 0) {
      setError('Upload minimaal één Realworks MHTML bestand');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const referenceData = buildReferenceData();
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      let response: Response;

      if (totalSize < 4 * 1024 * 1024) {
        // Small uploads: straight to the API as form-data
        const formData = new FormData();
        formData.append('referenceData', JSON.stringify(referenceData));
        files.forEach((file, i) => formData.append(`realworks_file_${i + 1}`, file));
        response = await fetch('/api/tuning', { method: 'POST', body: formData });
      } else {
        // Large uploads: via Vercel Blob, same as the normal analysis flow
        const { upload } = await import('@vercel/blob/client');
        const blobs = await Promise.all(
          files.map(async (file) => {
            const blob = await upload(file.name, file, {
              access: 'public',
              handleUploadUrl: '/api/upload-blob',
              multipart: file.size > 5 * 1024 * 1024,
              clientPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
            });
            return { url: blob.url, name: file.name, size: file.size };
          })
        );
        response = await fetch('/api/tuning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referenceData, blobs }),
        });
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request mislukt (status ${response.status})`);
      }

      const data = await response.json();
      setCandidates(data.candidates || []);
      setTotalParsed(data.total_parsed || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis');
    } finally {
      setIsLoading(false);
    }
  };

  // Live re-ranking: combine cached feature scores with current weights
  const ranked = useMemo(() => {
    if (!candidates) return null;

    const defaultOrder = [...candidates].sort((a, b) => b.default_score - a.default_score);
    const defaultRank = new Map<string, number>();
    defaultOrder.forEach((c, i) => defaultRank.set(c.address_full, i + 1));

    return candidates
      .map((c) => ({
        ...c,
        score: combineFeatureScores(c.features, weights),
        defaultRank: defaultRank.get(c.address_full) || 0,
      }))
      .sort((a, b) => b.score - a.score);
  }, [candidates, weights]);

  const baseWeightSum = BASE_WEIGHT_KEYS.reduce((sum, { key }) => sum + weights[key], 0);

  const setWeight = (key: keyof SimilarityWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const saveWeights = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
    setHasSavedWeights(true);
  };

  const clearSavedWeights = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHasSavedWeights(false);
  };

  const copyWeights = async () => {
    await navigator.clipboard.writeText(JSON.stringify(weights, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isDefault = JSON.stringify(weights) === JSON.stringify(DEFAULT_WEIGHTS);

  return (
    <div className="min-h-screen bg-gray-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center relative">
          <a
            href="/"
            className="absolute left-0 top-1 text-sm text-gray-400 hover:text-blue-400 transition-colors"
          >
            ← Terug naar analyse
          </a>
          <h1 className="text-3xl font-bold text-white">🔧 Parameter Tuning</h1>
          <p className="text-gray-400 mt-2">
            Stem de gewichten van de best match selector af en zie de top 15 live veranderen.
          </p>
          {hasSavedWeights && (
            <p className="mt-2 inline-block text-sm bg-green-900/30 border border-green-500 text-green-300 px-3 py-1 rounded-full">
              Aangepaste parameters actief — nieuwe analyses gebruiken deze gewichten
            </p>
          )}
          {autoLoaded && (
            <p className="mt-2 block text-sm text-blue-300">
              📂 Realworks data van je laatste analyse wordt automatisch geladen — direct tunen, geen upload nodig.
            </p>
          )}
        </div>

        {/* Reference property + data loading */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Referentiewoning</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Adres</label>
                <input
                  type="text"
                  value={reference.address}
                  onChange={(e) => setReference((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Bijv. Eerste Laurierdwarsstraat 19, Amsterdam"
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Oppervlakte (m²)</label>
                  <input
                    type="number"
                    value={reference.oppervlakte}
                    onChange={(e) =>
                      setReference((p) => ({ ...p, oppervlakte: parseInt(e.target.value) || '' }))
                    }
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Kamers</label>
                  <input
                    type="number"
                    value={reference.kamers}
                    onChange={(e) =>
                      setReference((p) => ({ ...p, kamers: parseInt(e.target.value) || '' }))
                    }
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Energielabel</label>
                  <select
                    value={reference.energielabel}
                    onChange={(e) => setReference((p) => ({ ...p, energielabel: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    {['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={reference.tuin}
                    onChange={(e) => setReference((p) => ({ ...p, tuin: e.target.checked }))}
                    className="rounded"
                  />
                  Tuin
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={reference.balkon}
                    onChange={(e) => setReference((p) => ({ ...p, balkon: e.target.checked }))}
                    className="rounded"
                  />
                  Balkon/terras
                </label>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Realworks data</h2>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <p className="text-gray-300">
                {files.length > 0
                  ? `${files.length} bestand(en) geselecteerd`
                  : 'Sleep MHTML bestanden hierheen of klik om te selecteren'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mhtml,.mht"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex justify-between text-sm text-gray-400">
                    <span className="truncate">{f.name}</span>
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-300 ml-3"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={loadCandidates}
              disabled={isLoading || files.length === 0}
              className={`mt-4 w-full py-2 rounded-lg font-medium transition-colors ${
                isLoading || files.length === 0
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Bezig met verwerken...' : 'Bereken kandidaten'}
            </button>
            {candidates && (
              <p className="mt-2 text-sm text-gray-400 text-center">
                {totalParsed} records geparsed, {candidates.length} unieke woningen
              </p>
            )}
            {error && (
              <p className="mt-2 text-sm text-red-400 text-center">{error}</p>
            )}
          </div>
        </div>

        {/* Weight sliders */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Gewichten</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
                disabled={isDefault}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  isDefault
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                Reset naar standaard
              </button>
              <button
                onClick={copyWeights}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600"
              >
                {copied ? 'Gekopieerd ✓' : 'Kopieer JSON'}
              </button>
              <button
                onClick={saveWeights}
                className="px-3 py-1.5 text-sm rounded-lg bg-green-700 text-white hover:bg-green-600"
              >
                Gebruik in analyses
              </button>
              {hasSavedWeights && (
                <button
                  onClick={clearSavedWeights}
                  className="px-3 py-1.5 text-sm rounded-lg bg-red-900/60 text-red-200 hover:bg-red-800"
                >
                  Verwijder opgeslagen
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
            {BASE_WEIGHT_KEYS.map(({ key, label }) => {
              // UI scale 0-10 in whole steps; stored internally as 0-1.
              // Untouched sliders keep the exact (non-integer) production default.
              const uiValue = weights[key] * 10;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-gray-400">
                      {Number.isInteger(uiValue) ? uiValue : uiValue.toFixed(1)}
                      <span className="text-gray-500 ml-1">
                        ({baseWeightSum > 0 ? ((weights[key] / baseWeightSum) * 100).toFixed(0) : 0}%)
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={uiValue}
                    onChange={(e) => setWeight(key, parseInt(e.target.value) / 10)}
                    className="w-full accent-blue-500"
                  />
                </div>
              );
            })}

            {(() => {
              const energyUi = weights.weight_energy_label * 10;
              return (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-yellow-300">Energielabel</span>
                    <span className="text-gray-400">
                      {Number.isInteger(energyUi) ? energyUi : energyUi.toFixed(1)}
                      <span className="text-gray-500 ml-1">
                        ({(weights.weight_energy_label * 100).toFixed(0)}% van eindscore)
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={energyUi}
                    onChange={(e) => setWeight('weight_energy_label', parseInt(e.target.value) / 10)}
                    className="w-full accent-yellow-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Vast aandeel van het energielabel in de eindscore; de rest komt uit de overige kenmerken samen.
                  </p>
                </div>
              );
            })()}

            <div>
              <div className="text-sm text-red-300 mb-2">Gracht-mismatch</div>
              <div className="flex gap-2">
                {[
                  { label: 'Uitsluiten', value: DEFAULT_WEIGHTS.gracht_penalty },
                  { label: 'Halve score', value: 0.5 },
                  { label: 'Geen penalty', value: 1 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setWeight('gracht_penalty', opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      Math.abs(weights.gracht_penalty - opt.value) < 0.01
                        ? 'bg-red-700 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Wat te doen als één van beide woningen wél aan een gracht ligt en de ander niet.
              </p>
            </div>
          </div>
        </div>

        {/* Live ranking */}
        {ranked && (
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Beste matches <span className="text-gray-400 font-normal">(live)</span>
              </h2>
              <select
                value={showCount}
                onChange={(e) => setShowCount(parseInt(e.target.value))}
                className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg border border-gray-600"
              >
                {[15, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>Top {n}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Δ</th>
                    <th className="py-2 pr-3">Adres</th>
                    <th className="py-2 pr-3 text-right">Prijs</th>
                    <th className="py-2 pr-3 text-right">m²</th>
                    <th className="py-2 pr-3 text-right">Kamers</th>
                    <th className="py-2 pr-3">Label</th>
                    <th className="py-2 pr-3">Verkocht</th>
                    <th className="py-2 pr-3 text-right">Opp.</th>
                    <th className="py-2 pr-3 text-right">Energie</th>
                    <th className="py-2 pr-3 text-right">Datum</th>
                    <th className="py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.slice(0, showCount).map((c, i) => {
                    const rank = i + 1;
                    const delta = c.defaultRank - rank;
                    return (
                      <tr
                        key={c.address_full}
                        className={`border-b border-gray-700/50 ${
                          rank <= 15 ? 'text-gray-200' : 'text-gray-500'
                        }`}
                      >
                        <td className="py-2 pr-3">{rank}</td>
                        <td className={`py-2 pr-3 ${
                          delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-600'
                        }`}>
                          {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–'}
                        </td>
                        <td className="py-2 pr-3 max-w-xs truncate" title={c.address_full}>
                          {c.address_full}
                          {c.features.gracht_mismatch && (
                            <span className="ml-2 text-xs text-red-400" title="Gracht-penalty actief">⚓</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{formatPrice(c.rw_sale_price)}</td>
                        <td className="py-2 pr-3 text-right">{c.rw_area_m2 ?? '—'}</td>
                        <td className="py-2 pr-3 text-right">{c.rw_rooms ?? '—'}</td>
                        <td className="py-2 pr-3">{c.rw_energy_label ?? '—'}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{c.rw_sale_date ?? '—'}</td>
                        <td className="py-2 pr-3 text-right text-gray-400">{formatScore(c.features.area)}</td>
                        <td className="py-2 pr-3 text-right text-gray-400">{formatScore(c.features.energy_label)}</td>
                        <td className="py-2 pr-3 text-right text-gray-400">{formatScore(c.features.sale_date)}</td>
                        <td className="py-2 text-right font-medium text-blue-300">{formatScore(c.score)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Δ = positieverandering t.o.v. de standaard gewichten. De kolommen Opp./Energie/Datum tonen de
              ongewogen subscores per kenmerk. Afstand is neutraal (50%) zolang er geen coördinaten beschikbaar zijn.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
