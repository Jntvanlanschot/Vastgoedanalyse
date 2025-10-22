'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { shallowEqualUnordered } from '@/lib/normalize';

// Feature flag for VectorGrid vs GeoJSON
const USE_VECTORGRID = process.env.NEXT_PUBLIC_USE_VECTORGRID === 'true';

// Dynamically import map components to avoid SSR issues
const MapComponent = dynamic(() => import('./MapComponent'), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-gray-600">Loading map...</p>
      </div>
    </div>
  )
});

const StreetGeoJsonPicker = dynamic(() => import('./StreetGeoJsonPicker'), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-gray-600">Loading street picker...</p>
      </div>
    </div>
  )
});

interface StreetFeature {
  type: 'Feature';
  properties: {
    name: string;
    highway: string;
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

interface StreetGeoJSON {
  type: 'FeatureCollection';
  features: StreetFeature[];
}

interface StreetMapPickerProps {
  lat: number;
  lng: number;
  onConfirm: (selectedStreets: string[]) => void;
  onError?: (error: string) => void;
}

export default function StreetMapPicker({ lat, lng, onConfirm, onError }: StreetMapPickerProps) {
  const [selectedStreets, setSelectedStreets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle street selection changes from vector layer - memoized with state guard
  const handleStreetSelectionChange = useCallback((streets: string[]) => {
    console.count('onSelectionChange');
    
    // Guard state updates: skip if no real change
    if (shallowEqualUnordered(selectedStreets, streets)) {
      return;
    }
    
    setSelectedStreets(streets);
    
    // Update success message based on selection length only
    if (streets.length === 5) {
      setSuccessMessage('Perfect! You have selected 5 streets. You can now run the scraper.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } else {
      setSuccessMessage(null);
    }
  }, [selectedStreets]);

  // Handle errors from vector layer
  const handleVectorLayerError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 3000);
  };


  const handleRemoveStreet = (streetName: string) => {
    setSelectedStreets(prev => prev.filter(name => name !== streetName));
    setSuccessMessage(null);
    // Reset layer selection for this street
    if (USE_VECTORGRID && (window as any).streetVectorLayerRemoveStreet) {
      (window as any).streetVectorLayerRemoveStreet(streetName);
    } else if (!USE_VECTORGRID && (window as any).streetGeoJsonPickerRemoveStreet) {
      (window as any).streetGeoJsonPickerRemoveStreet(streetName);
    }
  };

  const handleReset = () => {
    setSelectedStreets([]);
    setSuccessMessage(null);
    // Reset layer selection
    if (USE_VECTORGRID && (window as any).streetVectorLayerReset) {
      (window as any).streetVectorLayerReset();
    } else if (!USE_VECTORGRID && (window as any).streetGeoJsonPickerReset) {
      (window as any).streetGeoJsonPickerReset();
    }
  };

  const handleRunScraper = () => {
    if (selectedStreets.length === 5) {
      onConfirm(selectedStreets);
    }
  };


  return (
    <div className="space-y-4">
      {/* Success message */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Success!</h3>
              <p className="mt-1 text-sm text-green-700">{successMessage}</p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setSuccessMessage(null)}
                  className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Select 5 streets near your address
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {USE_VECTORGRID 
              ? 'Zoom in to level 13 or higher, then click on any street to select it. Selected streets will be highlighted in blue. You need exactly 5 streets.'
              : 'Click on any street to select it. Selected streets will be highlighted in blue. You need exactly 5 streets.'
            }
          </p>
          {USE_VECTORGRID && typeof window !== 'undefined' && window.location.search.includes('mode=geojson') && (
            <p className="text-sm text-blue-600 mt-1">
              🔧 Debug mode: Using GeoJSON fallback instead of vector tiles
            </p>
          )}
          {!USE_VECTORGRID && (
            <p className="text-sm text-green-600 mt-1">
              ✅ Using reliable Overpass GeoJSON street data
            </p>
          )}
        </div>
        
        <div className="relative">
          <div className="w-full h-96 rounded-b-lg bg-gray-100" style={{ minHeight: '480px' }}>
            {USE_VECTORGRID ? (
              <MapComponent
                lat={lat}
                lng={lng}
                selectedStreets={selectedStreets}
                onStreetSelectionChange={handleStreetSelectionChange}
                onError={handleVectorLayerError}
              />
            ) : (
              <StreetGeoJsonPicker
                lat={lat}
                lng={lng}
                onStreetSelectionChange={handleStreetSelectionChange}
                onError={handleVectorLayerError}
              />
            )}
          </div>
          
          {/* Selection counter overlay */}
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm z-[1000]">
            <span className="text-sm font-medium text-gray-700">
              {selectedStreets.length}/5 selected
            </span>
          </div>
          
          {/* Zoom hint overlay - only for VectorGrid */}
          {USE_VECTORGRID && (
            <div className="absolute bottom-4 left-4 bg-blue-50/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm z-[1000] border border-blue-200">
              <span className="text-sm font-medium text-blue-800">
                💡 Zoom in to level 13+ to select streets
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selected streets */}
      {selectedStreets.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">Selected Streets</h4>
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Reset
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {selectedStreets.map((street) => (
              <div
                key={street}
                className="flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-sm"
              >
                <span>{street}</span>
                <button
                  onClick={() => handleRemoveStreet(street)}
                  className="text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  aria-label={`Remove ${street}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {selectedStreets.length < 5 && (
            <span>Select {5 - selectedStreets.length} more street{5 - selectedStreets.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        
        <button
          onClick={handleRunScraper}
          disabled={selectedStreets.length !== 5}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Run Scraper
        </button>
      </div>
    </div>
  );
}