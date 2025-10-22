'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSubject } from '@/lib/hooks/useSubject';
import { nearestBuurtenNL, BuurtWithDistance } from '@/lib/nearestBuurten';
import { buildApifyInputFromBuurten, formatApifyInputAsJson } from '@/lib/fundaBuilder';
import BuurtenMap from '@/components/BuurtenMap';

export default function NearestBuurtenNLPage() {
  const subject = useSubject();
  const [nearestBuurten, setNearestBuurten] = useState<BuurtWithDistance[]>([]);
  const [apifyJson, setApifyJson] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [replacementBuurt, setReplacementBuurt] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Calculate nearest buurten when subject changes
  useEffect(() => {
    if (subject) {
      setIsLoading(true);
      setError(null);
      
      try {
        const nearest = nearestBuurtenNL({ lat: subject.lat, lng: subject.lng }, 4);
        setNearestBuurten(nearest);
        
        // Generate Apify JSON with top 2 buurten only
        const top2Buurten = nearest.slice(0, 2);
        const apifyInput = buildApifyInputFromBuurten(top2Buurten);
        const jsonString = formatApifyInputAsJson(apifyInput);
        setApifyJson(jsonString);
        
        // Log for debugging
        console.log('Selected 4 nearest buurten:', nearest.map(b => ({
          name: b.name,
          municipality: b.municipalitySlug,
          fundaSlug: b.fundaSlug,
          distance_m: Math.round(b.distance_m)
        })));
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        console.error('Error calculating nearest buurten:', err);
      } finally {
        setIsLoading(false);
      }
    }
  }, [subject]);

  const copyToClipboard = useCallback(async () => {
    if (!apifyJson) return;
    
    try {
      await navigator.clipboard.writeText(apifyJson);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      setError('Failed to copy to clipboard');
    }
  }, [apifyJson]);

  const runAnalysis = useCallback(async () => {
    if (!apifyJson) return;
    
    try {
      setIsScraping(true);
      setError(null);

      // Parse the generated Apify JSON to send to the scraper
      const apifyConfig = JSON.parse(apifyJson);

      console.log('Sending Apify config to /api/run-scraper:', apifyConfig);

      const response = await fetch('/api/run-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apifyConfig),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use the status text
          console.log('Response is not JSON, using status text');
        }
        throw new Error(errorMessage);
      }

      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'funda-buurten-nl.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setIsScraping(false);
    }
  }, [apifyJson]);

  const handleReplaceBuurt = useCallback((index: number) => {
    setReplacingIndex(index);
    setReplacementBuurt('');
  }, []);

  const handleConfirmReplacement = useCallback(() => {
    if (replacingIndex === null || !replacementBuurt.trim()) return;

    const newBuurten = [...nearestBuurten];
    // Replace the buurt name and generate a new funda slug
    newBuurten[replacingIndex] = {
      ...newBuurten[replacingIndex],
      name: replacementBuurt.trim(),
      fundaSlug: replacementBuurt.trim().toLowerCase().replace(/\s+/g, '-'),
    };

    setNearestBuurten(newBuurten);
    setReplacingIndex(null);
    setReplacementBuurt('');
  }, [replacingIndex, replacementBuurt, nearestBuurten]);

  const handleCancelReplacement = useCallback(() => {
    setReplacingIndex(null);
    setReplacementBuurt('');
  }, []);

  const generateApifyCode = useCallback(() => {
    // Use top 2 buurten for Apify code generation
    const top2Buurten = nearestBuurten.slice(0, 2);
    const apifyInput = buildApifyInputFromBuurten(top2Buurten);
    const jsonString = formatApifyInputAsJson(apifyInput);
    setApifyJson(jsonString);
  }, [nearestBuurten]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newBuurten = [...nearestBuurten];
    const draggedBuurt = newBuurten[draggedIndex];
    
    // Remove the dragged item
    newBuurten.splice(draggedIndex, 1);
    
    // Insert at new position
    newBuurten.splice(dropIndex, 0, draggedBuurt);
    
    setNearestBuurten(newBuurten);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, nearestBuurten]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  if (!subject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading address data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Dichtstbijzijnde Buurten</h1>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Map Section */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Buurten Kaart</h2>
            <BuurtenMap 
              className="h-[600px]" 
              addressLat={subject.lat} 
              addressLng={subject.lng} 
            />
          </div>
          
          {/* Content Section */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Adres Informatie</h2>
              <p className="text-gray-700"><strong>Adres:</strong> {subject.address}</p>
              <p className="text-gray-700"><strong>Coördinaten:</strong> {subject.lat.toFixed(4)}, {subject.lng.toFixed(4)}</p>
              <p className="text-gray-700"><strong>Stad:</strong> {subject.city}</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">4 Dichtstbijzijnde Buurten</h2>
              <p className="text-sm text-gray-600 mb-4">Klik op een buurt om deze te vervangen door een andere naam. Sleep buurten om ze te herordenen. De 2 bovenste buurten worden gebruikt voor de analyse.</p>
              
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Berekenen van dichtstbijzijnde buurten...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {nearestBuurten.map((buurt, index) => (
                    <div key={`${index}-${buurt.municipalitySlug}-${buurt.fundaSlug}`}>
                      {replacingIndex === index ? (
                        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Nieuwe buurt naam:
                            </label>
                            <input
                              type="text"
                              value={replacementBuurt}
                              onChange={(e) => setReplacementBuurt(e.target.value)}
                              placeholder="Voer nieuwe buurt naam in..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleConfirmReplacement}
                              disabled={!replacementBuurt.trim()}
                              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              Bevestigen
                            </button>
                            <button
                              onClick={handleCancelReplacement}
                              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                            >
                              Annuleren
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleReplaceBuurt(index)}
                          className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-colors ${
                            draggedIndex === index 
                              ? 'bg-blue-200 opacity-50' 
                              : dragOverIndex === index 
                                ? 'bg-blue-100 border-2 border-blue-300' 
                                : 'bg-blue-50 hover:bg-blue-100'
                          }`}
                        >
                          <div className="flex items-center flex-1">
                            <div className="mr-3 text-gray-400 cursor-move">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-blue-900">{buurt.name}</div>
                              <div className="text-sm text-blue-700">
                                {buurt.municipalitySlug} • {Math.round(buurt.distance_m)}m afstand
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-blue-600 font-mono">
                            {buurt.municipalitySlug}/{buurt.fundaSlug}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Apify JSON</h2>
            <p className="text-sm text-gray-600 mb-4">
              Kopieer deze JSON direct naar je Apify Funda scraper (gebruikt de top 2 buurten):
            </p>
            
            <div className="flex justify-between items-center mb-4">
              <p className="text-gray-700">Apify input configuratie:</p>
              <div className="flex gap-2">
                <button
                  onClick={generateApifyCode}
                  disabled={nearestBuurten.length < 2}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                    nearestBuurten.length >= 2
                      ? 'bg-orange-600 hover:bg-orange-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Generate Code
                </button>
                <button
                  onClick={copyToClipboard}
                  disabled={!apifyJson}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                    copySuccess
                      ? 'bg-green-600 text-white'
                      : apifyJson
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {copySuccess ? 'Gekopieerd!' : 'Kopieer JSON'}
                </button>
              </div>
            </div>
            
            <pre className="bg-gray-100 text-gray-800 p-4 rounded-md overflow-x-auto text-sm max-h-96">
              {apifyJson || 'Generating...'}
            </pre>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Analyse Starten</h2>
            <p className="text-sm text-gray-600 mb-4">
              Start de Funda scraper met de geselecteerde buurten:
            </p>
            
            <button
              onClick={runAnalysis}
              disabled={!apifyJson || isScraping}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isScraping ? 'Analyse Bezig...' : 'Start Funda Scraper'}
            </button>
          </div>
        </div>

        {isScraping && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Scraper Bezig...</h3>
                <p className="text-gray-600">
                  Dit kan enkele minuten duren. Sluit deze pagina niet.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
