'use client';

import { useState } from 'react';
import GooglePlacesAutocomplete from '../components/GooglePlacesAutocomplete';
import RunAnalysisButton from '../components/RunAnalysisButton';

interface GeoData {
  lat: number;
  lng: number;
  city: string;
  neighbourhood: string;
}

interface ApiResponse {
  searchUrls: string[];
  maxItems: number;
  includeSold: boolean;
  includeUnderOffer: boolean;
  proxyConfiguration: {
    useApifyProxy: boolean;
  };
  geo?: {
    lat: number;
    lng: number;
    city: string;
    address: string;
  };
}

export default function Home() {
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    const selectedAddress = place.formatted_address || place.name || '';
    setAddress(selectedAddress);
    console.log('Selected place:', place);
  };

  const copyToClipboard = async () => {
    if (!result) return;
    
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        searchUrls: result.searchUrls,
        maxItems: result.maxItems,
        includeSold: result.includeSold,
        includeUnderOffer: result.includeUnderOffer,
        proxyConfiguration: result.proxyConfiguration
      }, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    setIsLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: address.trim() }),
      });

      const data = await response.json();
      console.log('Response:', data);
      
      // Check if response has error property
      if (data.error) {
        console.error('API Error:', data.error);
        return;
      }
      
      // Store address and geo data in sessionStorage for the nationwide buurten page
      if (data.geo) {
        sessionStorage.setItem('selectedAddress', data.geo.address);
        sessionStorage.setItem('addressGeo', JSON.stringify({
          lat: data.geo.lat,
          lng: data.geo.lng,
          city: data.geo.city
        }));
        
        // Navigate to the nationwide buurten page
        window.location.href = '/nearest-buurten-nl';
        return;
      }
      
      // Set the result (now directly the Apify-compatible JSON)
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-gray-800 rounded-2xl shadow-lg p-10 max-w-2xl w-full mx-4">
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-white text-center">
            AI Vastgoedanalyse
          </h1>
          <p className="text-gray-300 text-center">
            Voer een adres in.
          </p>
          
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <GooglePlacesAutocomplete
              onPlaceSelect={handlePlaceSelect}
              placeholder="Voer adres in..."
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !address.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
            >
              {isLoading ? 'Bezig...' : 'Zoeken'}
            </button>
          </form>

          {result && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Apify Funda Scraper Configuratie</h2>
                <button
                  onClick={copyToClipboard}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                    copySuccess
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {copySuccess ? 'Gekopieerd!' : 'Kopieer JSON'}
                </button>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                {JSON.stringify({
                  searchUrls: result.searchUrls,
                  maxItems: result.maxItems,
                  includeSold: result.includeSold,
                  includeUnderOffer: result.includeUnderOffer,
                  proxyConfiguration: result.proxyConfiguration
                }, null, 2)}
              </pre>
              <p className="text-gray-400 text-sm mt-2">
                Deze JSON is direct klaar voor gebruik in de Apify Funda scraper (ID: 69aVxdpQm6bIIJyNb)
              </p>
              
              {/* Run Analysis Button */}
              <RunAnalysisButton fundaConfig={result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}