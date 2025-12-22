'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import Leaflet to avoid SSR issues
const L = dynamic(() => import('leaflet'), { ssr: false });

interface BuurtenMapProps {
  className?: string;
  showNetherlands?: boolean;
  addressLat?: number;
  addressLng?: number;
  city?: string; // City name (e.g., 'amsterdam', 'rotterdam', 'utrecht')
}

export default function BuurtenMap({ className = '', showNetherlands = false, addressLat, addressLng, city }: BuurtenMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const geoJsonLayerRef = useRef<any>(null);
  const selectedBuurtRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBuurt, setSelectedBuurt] = useState<string | null>(null);
  const [selectedBuurtName, setSelectedBuurtName] = useState<string | null>(null);
  const [hoveredBuurt, setHoveredBuurt] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    selectedBuurtRef.current = selectedBuurt;
  }, [selectedBuurt]);

  // Initialize map (only once)
  useEffect(() => {
    if (!isClient || !mapRef.current || mapInstanceRef.current) return;

    // Dynamically import Leaflet and initialize map
    import('leaflet').then((L) => {
      // Fix for default markers in Leaflet with Next.js
      delete (L.default.Icon.Default.prototype as any)._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      // Initialize map centered on address if provided, otherwise default to Amsterdam
      const centerLat = addressLat || 52.3676;
      const centerLng = addressLng || 4.9041;
      const initialZoom = addressLat && addressLng ? 13 : 10; // Zoom to neighborhood level if address provided
      const map = L.default.map(mapRef.current).setView([centerLat, centerLng], initialZoom);
      mapInstanceRef.current = map;

      // Add OSM tiles with proper attribution
      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
    });

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isClient, addressLat, addressLng]);

  // Load GeoJSON data and update map (when city/address changes)
  useEffect(() => {
    if (!isClient || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    
    // Load GeoJSON data
    const loadGeoJson = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Determine which GeoJSON file to load based on city or showNetherlands flag
        let dataFile: string;
        if (showNetherlands) {
          dataFile = 'buurten-nl.geojson';
        } else if (city) {
          const cityLower = city.toLowerCase();
          // Map city names to GeoJSON files
          if (cityLower === 'amsterdam') {
            dataFile = 'buurten-amsterdam-wgs84.geojson';
          } else if (cityLower === 'rotterdam') {
            dataFile = 'buurten-rotterdam-wgs84.geojson';
          } else if (cityLower === 'utrecht') {
            dataFile = 'buurten-utrecht-wgs84.geojson';
          } else {
            // Unknown city, use combined file
            dataFile = 'buurten-nl.geojson';
          }
        } else {
          // Default to Amsterdam if no city specified
          dataFile = 'buurten-amsterdam-wgs84.geojson';
        }
        
        const response = await fetch(`/data/${dataFile}`);
        
        if (!response.ok) {
          throw new Error(`Failed to load GeoJSON: ${response.status} ${response.statusText}`);
        }

        const geoJsonData = await response.json();

        // Remove existing layer if it exists
        if (geoJsonLayerRef.current) {
          map.removeLayer(geoJsonLayerRef.current);
        }

        // Import Leaflet for GeoJSON layer creation
        const L = await import('leaflet');
        
        // Create GeoJSON layer with styling
        const geoJsonLayer = L.default.geoJSON(geoJsonData, {
          style: (feature) => {
            // Support both old format (bu_code) and new format (buurtcode)
            const buurtCode = feature?.properties?.bu_code || feature?.properties?.buurtcode;
            const isSelected = selectedBuurt === buurtCode;
            
            return {
              color: isSelected ? '#1e40af' : '#374151',
              weight: isSelected ? 3 : 2,
              fillColor: isSelected ? '#3b82f6' : '#e5e7eb',
              fillOpacity: isSelected ? 0.4 : 0.2,
              opacity: 1,
            };
          },
          onEachFeature: (feature, layer) => {
            const properties = feature.properties;
            // Support both old format (bu_code, bu_naam, gm_naam) and new format (buurtcode, buurtnaam, gemeentenaam)
            const buurtCode = properties?.bu_code || properties?.buurtcode;
            const buurtName = properties?.bu_naam || properties?.buurtnaam;
            const gemeenteName = properties?.gm_naam || properties?.gemeentenaam;

            // Add popup
            if (buurtName && gemeenteName) {
              layer.bindPopup(`
                <div>
                  <strong>${buurtName}</strong><br/>
                  <small>${gemeenteName}</small>
                </div>
              `);
            }

            // Add hover effects
            layer.on('mouseover', (e) => {
              const layer = e.target;
              
              // Set hovered buurt name
              setHoveredBuurt(buurtName);
              
              // Change cursor
              if (mapRef.current) {
                mapRef.current.style.cursor = 'pointer';
              }
            });

            layer.on('mouseout', (e) => {
              // Clear hovered buurt name
              setHoveredBuurt(null);
              
              // Reset cursor
              if (mapRef.current) {
                mapRef.current.style.cursor = '';
              }
            });

            // Add click handler for selection
            layer.on('click', (e) => {
              const currentSelectedBuurt = selectedBuurtRef.current;
              const newSelectedBuurt = currentSelectedBuurt === buurtCode ? null : buurtCode;
              const newSelectedBuurtName = currentSelectedBuurt === buurtCode ? null : buurtName;
              
              // Update ref immediately
              selectedBuurtRef.current = newSelectedBuurt;
              
              // Reset previously selected buurt if there was one
              if (currentSelectedBuurt && currentSelectedBuurt !== buurtCode) {
                geoJsonLayerRef.current?.eachLayer((prevLayer) => {
                  const prevFeature = prevLayer.feature;
                  const prevBuurtCode = prevFeature?.properties?.bu_code || prevFeature?.properties?.buurtcode;
                  if (prevBuurtCode === currentSelectedBuurt) {
                    prevLayer.setStyle({
                      color: '#374151',
                      weight: 2,
                      fillColor: '#e5e7eb',
                      fillOpacity: 0.2,
                      opacity: 1,
                    });
                  }
                });
              }
              
              setSelectedBuurt(newSelectedBuurt);
              setSelectedBuurtName(newSelectedBuurtName);
              
              // Update only the clicked layer's style
              const isSelected = newSelectedBuurt === buurtCode;
              layer.setStyle({
                color: isSelected ? '#1e40af' : '#374151',
                weight: isSelected ? 3 : 2,
                fillColor: isSelected ? '#3b82f6' : '#e5e7eb',
                fillOpacity: isSelected ? 0.4 : 0.2,
                opacity: 1,
              });
            });
          },
        });

        geoJsonLayerRef.current = geoJsonLayer;
        geoJsonLayer.addTo(map);

        // Add/update red marker for address coordinates if provided
        // Remove existing marker first
        if ((map as any)._addressMarker) {
          map.removeLayer((map as any)._addressMarker);
        }
        
        if (addressLat && addressLng) {
          const redIcon = L.default.divIcon({
            className: 'custom-red-marker',
            html: '<div style="background-color: red; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });
          
          const marker = L.default.marker([addressLat, addressLng], { icon: redIcon }).addTo(map);
          (map as any)._addressMarker = marker;
        }

        // Fit map to GeoJSON bounds, but ensure address is visible
        if (geoJsonData.features && geoJsonData.features.length > 0) {
          const bounds = geoJsonLayer.getBounds();
          
          // If address is provided, ensure it's included in the bounds
          if (addressLat && addressLng) {
            const addressPoint = L.default.latLng(addressLat, addressLng);
            bounds.extend(addressPoint);
          }
          
          // Fit bounds with padding to show all neighborhoods
          map.fitBounds(bounds, { 
            padding: [50, 50], // Add padding so boundaries aren't at the edge
            maxZoom: 15 // Limit max zoom so we can see multiple neighborhoods
          });
          
          // Center on address after a short delay to ensure bounds are set
          if (addressLat && addressLng) {
            setTimeout(() => {
              map.setView([addressLat, addressLng], Math.min(map.getZoom(), 14), { animate: true });
            }, 200);
          }
        } else if (addressLat && addressLng) {
          // If no GeoJSON features but address is provided, center on address
          map.setView([addressLat, addressLng], 13);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Error loading GeoJSON:', err);
        setError(err instanceof Error ? err.message : 'Failed to load map data');
        setIsLoading(false);
      }
    };

    loadGeoJson();
  }, [isClient, showNetherlands, city, addressLat, addressLng, selectedBuurt]);

  // Import CSS dynamically
  useEffect(() => {
    if (isClient) {
      import('leaflet/dist/leaflet.css');
    }
  }, [isClient]);

  if (!isClient) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full h-full min-h-[400px] bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600 text-sm">Loading map...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-full min-h-[400px]" />
      
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600 text-sm">Loading map data...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded z-10">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm">
                <strong>Warning:</strong> {error}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {hoveredBuurt && (
        <div className="absolute top-4 left-4 bg-gray-800 text-white px-3 py-2 rounded shadow-lg z-10">
          <p className="text-sm font-medium">{hoveredBuurt}</p>
        </div>
      )}
      
      {selectedBuurt && selectedBuurtName && (
        <div className="absolute top-4 right-4 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded z-10">
          <p className="text-sm">
            <strong>Selected:</strong> {selectedBuurtName}
          </p>
        </div>
      )}
    </div>
  );
}
