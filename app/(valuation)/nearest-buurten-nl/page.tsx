'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSubject } from '@/lib/hooks/useSubject';
import { nearestBuurtenNL, BuurtWithDistance } from '@/lib/nearestBuurten';
import { buildApifyInputFromBuurten } from '@/lib/fundaBuilder';
import BuurtenMap from '@/components/BuurtenMap';

export default function NearestBuurtenNLPage() {
  const subject = useSubject();
  const [nearestBuurten, setNearestBuurten] = useState<BuurtWithDistance[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const [copySuccess, setCopySuccess] = useState(false);
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
        
        // Default-select the first 2 buurten
        setSelectedIndexes(new Set([0, 1]));
        
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

  // removed copy functionality (no longer needed)

  const runAnalysis = useCallback(async () => {
    // Build Apify input from selected buurten (1-3 required)
    const selected = Array.from(selectedIndexes)
      .sort((a, b) => a - b)
      .map(i => nearestBuurten[i])
      .filter(Boolean);
    if (selected.length < 1 || selected.length > 3) {
      setError('Selecteer 1 tot 3 buurten.');
      return;
    }

    try {
      setIsScraping(true);
      setError(null);

      // Build Apify config dynamically based on selected buurten
      const apifyConfig = buildApifyInputFromBuurten(selected);

      // Get reference data from sessionStorage
      const referenceDataStr = sessionStorage.getItem('referenceData');
      let referenceData = null;
      if (referenceDataStr) {
        try {
          referenceData = JSON.parse(referenceDataStr);
        } catch (e) {
          console.error('Failed to parse reference data:', e);
        }
      }

      // Combine Apify config with reference data
      const requestBody = {
        ...apifyConfig,
        referenceData: referenceData
      };

      console.log('Sending request to /api/run-scraper:', requestBody);

      const response = await fetch('/api/run-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use the status text
          console.log('Response is not JSON, using status text');
        }
        throw new Error(errorMessage);
      }

      // Check if response contains workflow results
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);
      
      if (contentType && contentType.includes('application/json')) {
        // Response contains workflow results
        const workflowResult = await response.json();
        console.log('Workflow result:', workflowResult);
        
        // Store street analysis results and CSV data in sessionStorage for the upload-realworks page
        // Check for street analysis results
        if (workflowResult.streetAnalysis && workflowResult.streetAnalysis.top_streets) {
          sessionStorage.setItem('streetAnalysisResult', JSON.stringify(workflowResult.streetAnalysis));
          console.log('Stored street analysis results in sessionStorage:', workflowResult.streetAnalysis);
          
          // Store CSV data for the upload-realworks page
          if (workflowResult.csvData) {
            sessionStorage.setItem('csvData', workflowResult.csvData);
            console.log('Stored CSV data in sessionStorage, length:', workflowResult.csvData.length);
          }
          
          // Automatically download CSV file
          if (workflowResult.downloadUrl) {
            console.log('Auto-downloading CSV file:', workflowResult.downloadUrl);
            console.log('RunId:', workflowResult.runId, 'DatasetId:', workflowResult.datasetId);
            
            // Use fetch to get the CSV data and create a blob download
            try {
              const response = await fetch(workflowResult.downloadUrl);
              if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `funda-data-${workflowResult.runId || 'scraped'}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                console.log('CSV download initiated successfully');
              } else {
                console.error('Failed to fetch CSV:', response.status, response.statusText);
              }
            } catch (error) {
              console.error('Error downloading CSV:', error);
            }
            
            // Wait a moment for download to start before redirecting
            setTimeout(() => {
              console.log('Redirecting to upload-realworks page...');
              window.location.href = '/upload-realworks';
            }, 1000); // 1 second delay
          } else {
            console.error('No downloadUrl found in workflow result:', workflowResult);
            // Navigate to upload-realworks page even if no download URL
            console.log('Redirecting to upload-realworks page...');
            window.location.href = '/upload-realworks';
          }
          
          return;
        } else {
          console.error('No street analysis results found in response:', workflowResult);
          setError('Geen straat analyse resultaten ontvangen van de scraper');
        }
      } else {
        // Response is CSV file (legacy behavior)
        console.log('Response is CSV file, downloading...');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'funda-buurten-nl.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Show message that CSV was downloaded but no workflow was run
        setError('CSV bestand gedownload, maar geen workflow analyse uitgevoerd. Controleer of de workflow correct is geconfigureerd.');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setIsScraping(false);
    }
  }, [nearestBuurten, selectedIndexes]);

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

  // removed manual code generation (now automatic)

  const toggleSelected = useCallback((index: number) => {
    setSelectedIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        return next;
      }
      // enforce max 3 selections
      if (next.size >= 3) {
        return next;
      }
      next.add(index);
      return next;
    });
  }, []);

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
          <div className={`bg-white rounded-lg shadow-sm border p-6 ${isScraping ? 'opacity-30 pointer-events-none' : ''}`}>
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
              <p className="text-sm text-gray-600 mb-4">Vink 1–3 buurten aan om te gebruiken voor de analyse. Sleep om te ordenen. Klik op een item (niet de checkbox) om de naam te vervangen.</p>
              
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
                          <div className="flex items-center gap-4">
                            <div className="text-sm text-blue-600 font-mono">
                              {buurt.municipalitySlug}/{buurt.fundaSlug}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleSelected(index); }}
                              className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIndexes.has(index) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400'}`}
                              aria-pressed={selectedIndexes.has(index)}
                              aria-label={`Selecteer ${buurt.name}`}
                            >
                              {selectedIndexes.has(index) && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
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
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Analyse Starten</h2>
            <p className="text-sm text-gray-600 mb-4">
              Start de Funda scraper met de aangevinkte buurten (1–3 toegestaan):
            </p>
            
            <button
              onClick={runAnalysis}
              disabled={isScraping || selectedIndexes.size < 1 || selectedIndexes.size > 3}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isScraping ? 'Analyse Bezig...' : 'Start Funda Scraper'}
            </button>
          </div>
        </div>

        {isScraping && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
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
