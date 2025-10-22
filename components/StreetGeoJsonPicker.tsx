'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { normalizeName, shallowEqualUnordered } from '@/lib/normalize';

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

interface StreetGeoJsonPickerProps {
  lat: number;
  lng: number;
  onStreetSelectionChange: (selectedStreets: string[]) => void;
  onError?: (error: string) => void;
}

export default function StreetGeoJsonPicker({ 
  lat, 
  lng, 
  onStreetSelectionChange, 
  onError 
}: StreetGeoJsonPickerProps) {
  const layerRef = useRef<L.Layer | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // State for street selection
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedDisplayNames, setSelectedDisplayNames] = useState<Map<string, string>>(new Map());
  const [nameToLayers, setNameToLayers] = useState<Map<string, L.Layer[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Ref to track last emitted selection to prevent feedback loops
  const selectedRef = useRef<string[]>([]);
  
  // Emit normalized selection to parent only when changed
  const emitSelectionChange = useCallback((newSelection: string[]) => {
    const normalized = newSelection.map(name => normalizeName(name)).filter(name => name.length > 0);
    const unique = Array.from(new Set(normalized));
    
    // Only emit if selection actually changed
    if (!shallowEqualUnordered(selectedRef.current, unique)) {
      selectedRef.current = unique;
      onStreetSelectionChange(newSelection);
    }
  }, [onStreetSelectionChange]);

  // Base style for streets
  const getBaseStyle = useCallback(() => ({
    color: '#6b7280', // grey-500
    weight: 6,
    opacity: 0.8,
    fillOpacity: 0,
  }), []);

  // Selected style for streets
  const getSelectedStyle = useCallback(() => ({
    color: '#3b82f6', // blue-500
    weight: 8,
    opacity: 1,
    fillOpacity: 0,
  }), []);

  // Hit style for better clickability
  const getHitStyle = useCallback(() => ({
    color: 'transparent',
    weight: 20,
    opacity: 0,
    fillOpacity: 0,
  }), []);

  // Handle street click
  const handleStreetClick = useCallback((e: any, streetName: string) => {
    console.log('🖱️ Street clicked:', streetName);
    
    const normalizedName = normalizeName(streetName);
    const isSelected = selectedNames.has(normalizedName);
    
    if (isSelected) {
      // Unselect
      setSelectedNames(prev => {
        const newSet = new Set(prev);
        newSet.delete(normalizedName);
        return newSet;
      });
      
      setSelectedDisplayNames(prev => {
        const newMap = new Map(prev);
        newMap.delete(normalizedName);
        return newMap;
      });
      
      // Reset all layers for this street to base style
      const layers = nameToLayers.get(normalizedName) || [];
      layers.forEach(layer => {
        if (layer instanceof L.Polyline) {
          layer.setStyle(getBaseStyle());
        }
      });
      
    } else if (selectedNames.size < 5) {
      // Select
      setSelectedNames(prev => {
        const newSet = new Set(prev);
        newSet.add(normalizedName);
        return newSet;
      });
      
      setSelectedDisplayNames(prev => {
        const newMap = new Map(prev);
        newMap.set(normalizedName, streetName);
        return newMap;
      });
      
      // Set all layers for this street to selected style
      const layers = nameToLayers.get(normalizedName) || [];
      layers.forEach(layer => {
        if (layer instanceof L.Polyline) {
          layer.setStyle(getSelectedStyle());
        }
      });
      
    } else {
      // Max reached
      onError?.('Maximum 5 streets allowed. Please deselect a street first.');
      return;
    }
    
    // Emit selection change
    const currentDisplayNames = Array.from(selectedDisplayNames.values());
    if (!isSelected && selectedNames.size < 5) {
      currentDisplayNames.push(streetName);
    } else if (isSelected) {
      const index = currentDisplayNames.indexOf(streetName);
      if (index > -1) {
        currentDisplayNames.splice(index, 1);
      }
    }
    
    emitSelectionChange(currentDisplayNames);
  }, [selectedNames, selectedDisplayNames, nameToLayers, getBaseStyle, getSelectedStyle, onError, emitSelectionChange]);

  // Load GeoJSON data
  const loadStreetData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/streets-overpass?lat=${lat}&lng=${lng}&radiusMeters=1200`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch street data: ${response.status}`);
      }
      
      const geoJsonData: StreetGeoJSON = await response.json();
      console.log('🗺️ Loaded GeoJSON data:', geoJsonData.features.length, 'features');
      
      // Clear existing layer
      if (layerRef.current && mapRef.current) {
        mapRef.current.removeLayer(layerRef.current);
      }
      
      // Create name-to-layers index
      const nameToLayersMap = new Map<string, L.Layer[]>();
      
      // Create GeoJSON layer
      const geoJsonLayer = L.geoJSON(geoJsonData, {
        style: (feature: any) => {
          const streetName = feature.properties.name;
          const normalizedName = normalizeName(streetName);
          const isSelected = selectedNames.has(normalizedName);
          
          return isSelected ? getSelectedStyle() : getBaseStyle();
        },
        onEachFeature: (feature: any, layer: L.Layer) => {
          const streetName = feature.properties.name;
          const normalizedName = normalizeName(streetName);
          
          // Add to name-to-layers index
          if (!nameToLayersMap.has(normalizedName)) {
            nameToLayersMap.set(normalizedName, []);
          }
          nameToLayersMap.get(normalizedName)!.push(layer);
          
          // Add click handler
          layer.on('click', (e: any) => {
            handleStreetClick(e, streetName);
          });
          
          // Add hover effects
          layer.on('mouseover', (e: any) => {
            if (layer instanceof L.Polyline) {
              layer.setStyle({
                weight: layer.options.weight! + 2,
                opacity: 1,
              });
            }
          });
          
          layer.on('mouseout', (e: any) => {
            if (layer instanceof L.Polyline) {
              const normalizedName = normalizeName(streetName);
              const isSelected = selectedNames.has(normalizedName);
              layer.setStyle(isSelected ? getSelectedStyle() : getBaseStyle());
            }
          });
          
          // Set cursor style
          layer.getElement()?.style.setProperty('cursor', 'pointer');
        }
      });
      
      // Add to map
      if (mapRef.current) {
        geoJsonLayer.addTo(mapRef.current);
        layerRef.current = geoJsonLayer;
        setNameToLayers(nameToLayersMap);
        
        console.log('✅ GeoJSON layer added to map');
      }
      
    } catch (err) {
      console.error('❌ Error loading street data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load street data');
      onError?.(err instanceof Error ? err.message : 'Failed to load street data');
    } finally {
      setLoading(false);
    }
  }, [lat, lng, selectedNames, getBaseStyle, getSelectedStyle, handleStreetClick, onError]);

  // Initialize map reference and load data
  useEffect(() => {
    const map = document.querySelector('.leaflet-container')?.closest('.leaflet-map') as any;
    if (map && map._leaflet_id) {
      mapRef.current = L.Map.prototype.get(map._leaflet_id);
      loadStreetData();
    }
  }, [loadStreetData]);

  // Reset function for parent to call
  const reset = useCallback(() => {
    setSelectedNames(new Set());
    setSelectedDisplayNames(new Map());
    setNameToLayers(new Map());
    selectedRef.current = [];
    emitSelectionChange([]);
    
    // Reset all layer styles
    if (layerRef.current) {
      layerRef.current.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Polyline) {
          layer.setStyle(getBaseStyle());
        }
      });
    }
  }, [emitSelectionChange, getBaseStyle]);

  // Remove specific street function
  const removeStreet = useCallback((displayName: string) => {
    const normalizedName = normalizeName(displayName);
    
    setSelectedNames(prev => {
      const newSet = new Set(prev);
      newSet.delete(normalizedName);
      return newSet;
    });
    
    setSelectedDisplayNames(prev => {
      const newMap = new Map(prev);
      newMap.delete(normalizedName);
      return newMap;
    });
    
    // Reset layer styles
    const layers = nameToLayers.get(normalizedName) || [];
    layers.forEach(layer => {
      if (layer instanceof L.Polyline) {
        layer.setStyle(getBaseStyle());
      }
    });
    
    // Emit updated selection
    const updatedNames = Array.from(selectedDisplayNames.values()).filter(n => n !== displayName);
    emitSelectionChange(updatedNames);
  }, [selectedDisplayNames, nameToLayers, getBaseStyle, emitSelectionChange]);

  // Expose functions to parent
  useEffect(() => {
    (window as any).streetGeoJsonPickerReset = reset;
    (window as any).streetGeoJsonPickerRemoveStreet = removeStreet;
  }, [reset, removeStreet]);

  // Status HUD
  return (
    <div className="geojson-status-hud absolute top-4 right-4 bg-black/80 text-white text-xs p-2 rounded z-[2000] font-mono">
      <div>mode: geojson</div>
      <div>status: {loading ? 'loading...' : error ? 'error' : 'ready'}</div>
      <div>streets: {selectedNames.size}/5</div>
      {error && <div className="text-red-400">error: {error}</div>}
    </div>
  );
}
