'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.vectorgrid';
import { makeStreetKey, normalizeName, normalizeSelection, shallowEqualUnordered } from '@/lib/normalize';

// Extend Leaflet types for VectorGrid
declare module 'leaflet' {
  namespace VectorGrid {
    function protobuf(url: string, options?: any): any;
  }
}

interface StreetVectorLayerProps {
  onStreetSelectionChange: (selectedStreets: string[]) => void;
  onError?: (error: string) => void;
}

interface VectorTileFeature {
  id: number | string;
  properties: {
    name?: string;
    'name:latin'?: string;
    class?: string;
    admin_level?: string;
    place?: string;
    [key: string]: any;
  };
  geometry: any;
}

export default function StreetVectorLayer({ onStreetSelectionChange, onError }: StreetVectorLayerProps) {
  const layerRef = useRef<L.Layer | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // State for street selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedDisplayNames, setSelectedDisplayNames] = useState<Map<string, string>>(new Map());
  const [featureIndex, setFeatureIndex] = useState<Map<string, Set<string>>>(new Map());
  const [currentZoom, setCurrentZoom] = useState<number>(6);
  
  // Ref to track last emitted selection to prevent feedback loops
  const selectedRef = useRef<string[]>([]);
  
  // Debug mode check
  const isDebugMode = typeof window !== 'undefined' && window.location.search.includes('mode=geojson');
  
  // Vector tiles status for HUD
  const [vectorTilesStatus, setVectorTilesStatus] = useState<'LOADING' | 'OK' | 'FAIL'>('LOADING');
  const [tileUrls, setTileUrls] = useState<string[]>([]);

  // GeoJSON fallback for debugging
  const initializeGeoJSONFallback = async () => {
    try {
      console.log('🔧 Loading GeoJSON fallback data...');
      const response = await fetch('/api/streets-overpass?lat=52.3676&lng=4.9041');
      const geoJsonData = await response.json();
      
      console.log('🔧 GeoJSON data loaded:', geoJsonData.features.length, 'features');
      
      const geoJsonLayer = L.geoJSON(geoJsonData, {
        style: (feature: any) => {
          const isSelected = selectedKeys.has(feature.properties.name);
          return {
            color: isSelected ? '#10b981' : '#3b82f6',
            weight: isSelected ? 6 : 3,
            opacity: isSelected ? 1 : 0.8,
          };
        },
        onEachFeature: (feature: any, layer: L.Layer) => {
          layer.on('click', (e: any) => {
            console.log('🔧 GeoJSON click:', feature.properties.name);
            handleStreetClick({
              layer: {
                properties: feature.properties,
                feature: feature
              }
            });
          });
        }
      });
      
      geoJsonLayer.addTo(mapRef.current!);
      layerRef.current = geoJsonLayer;
      
      console.log('🔧 GeoJSON layer added successfully');
    } catch (error) {
      console.error('🔧 GeoJSON fallback failed:', error);
      onError?.('Failed to load GeoJSON fallback data');
    }
  };

  // 1) Env & URL - Ensure .pbf vector tiles endpoint
  const vectorTilesUrl = process.env.NEXT_PUBLIC_VTILES_URL || 'https://tiles.openfreemap.org/omt/{z}/{x}/{y}.pbf';
  
  console.log('🌐 Using vector tiles URL:', vectorTilesUrl);
  
  // Fallback URLs to try if primary fails
  const fallbackUrls = [
    'https://tiles.openfreemap.org/omt/{z}/{x}/{y}.pbf',
    'https://api.maptiler.com/tiles/v3-openmaptiles/{z}/{x}/{y}.pbf?key=get_your_own_OpIi9ZULNHzrESv6T2vL',
    'https://tile.nextzen.org/tilezen/vector/v1/512/all/{z}/{x}/{y}.mvt?api_key=nextzen-api-key'
  ];

  // Base style for roads
  const getBaseStyle = useCallback(() => ({
    weight: 2,
    color: '#3b82f6',
    opacity: 0.7,
    fillOpacity: 0,
  }), []);

  // Selected style for roads
  const getSelectedStyle = useCallback(() => ({
    weight: 6,
    color: '#10b981',
    opacity: 1,
    fillOpacity: 0,
  }), []);

  // Hit style for better clickability - much wider transparent stroke
  const getHitStyle = useCallback(() => ({
    weight: 20,
    color: 'transparent',
    opacity: 0,
    fillOpacity: 0,
  }), []);

  // Filter function for road features - OpenMapTiles transportation layer
  const filterRoads = useCallback((feature: VectorTileFeature) => {
    const roadClass = feature.properties.class;
    const allowedClasses = ['residential', 'living_street', 'unclassified', 'service', 'tertiary', 'secondary', 'primary'];
    const hasName = feature.properties.name || feature.properties['name:latin'];
    return allowedClasses.includes(roadClass) && hasName;
  }, []);

  // Handle tile loading to maintain feature index and persist selections
  const handleTileLoad = useCallback((e: any) => {
    console.log('🔍 TILE LOAD EVENT:', e);
    
    // 1) Validate required layers exist
    if (e.tile && e.tile.layers) {
      const layerKeys = Object.keys(e.tile.layers);
      console.log('📋 Vector layers in tiles:', layerKeys);
      
      // Check for required layers
      const hasTransportation = layerKeys.includes('transportation');
      const hasTransportationName = layerKeys.includes('transportation_name');
      
      if (!hasTransportation || !hasTransportationName) {
        console.warn('⚠️ Missing required layers:', {
          transportation: hasTransportation,
          transportation_name: hasTransportationName,
          available: layerKeys
        });
        
        // Update HUD with warning
        const hudElement = document.querySelector('.vector-tiles-hud');
        if (hudElement) {
          hudElement.innerHTML = `
            <div>tiles: vector=${vectorTilesStatus}</div>
            <div>⚠️ tiles missing transportation_name</div>
            <div>available: ${layerKeys.join(', ')}</div>
          `;
        }
      }
      
      // Log sample features from each layer
      layerKeys.forEach(layerKey => {
        const layerFeatures = e.tile.layers[layerKey]?.features || [];
        if (layerFeatures.length > 0) {
          console.log(`📝 Layer "${layerKey}" has ${layerFeatures.length} features`);
          const sampleFeature = layerFeatures[0];
          console.log(`📝 Sample "${layerKey}" feature properties:`, Object.keys(sampleFeature.properties || {}));
        }
      });
    }
    
    const features = e.features || [];
    console.log('🛣️ Total features in tile:', features.length);
    
    let roadFeatureCount = 0;
    const sampleProperties: any[] = [];
    
    setFeatureIndex(prev => {
      const newIndex = new Map(prev);
      
      features.forEach((feature: VectorTileFeature) => {
        if (filterRoads(feature)) {
          roadFeatureCount++;
          
          // Log first 3 sample properties
          if (sampleProperties.length < 3) {
            sampleProperties.push({
              id: feature.id,
              properties: feature.properties,
              geometry: feature.geometry?.type
            });
          }
          
          const name = feature.properties.name || feature.properties['name:latin'];
          const adminArea = feature.properties.place || feature.properties.admin_level;
          const streetKey = makeStreetKey(name, adminArea);
          const featureId = feature.properties.osm_id || feature.properties.id || feature.properties.osm_way_id || feature.id;
          
          if (!newIndex.has(streetKey)) {
            newIndex.set(streetKey, new Set());
          }
          newIndex.get(streetKey)!.add(String(featureId));
          
          // Immediately apply selected style if this street is selected
          if (selectedKeys.has(streetKey) && layerRef.current) {
            try {
              layerRef.current.setFeatureStyle(String(featureId), getSelectedStyle());
            } catch (error) {
              // Feature might not be ready yet, ignore
            }
          }
        }
      });
      
      console.log('🛣️ Road features parsed:', roadFeatureCount);
      if (sampleProperties.length > 0) {
        console.log('📝 First 3 sample properties:', sampleProperties);
      }
      
      return newIndex;
    });
  }, [filterRoads, selectedKeys, getSelectedStyle]);

  // Emit normalized selection to parent only when changed
  const emitSelectionChange = useCallback((newSelection: string[]) => {
    const normalized = normalizeSelection(newSelection);
    
    // Only emit if selection actually changed
    if (!shallowEqualUnordered(selectedRef.current, normalized)) {
      selectedRef.current = normalized;
      onStreetSelectionChange(normalized);
    }
  }, [onStreetSelectionChange]);

  // Apply selected style to all segments of a street
  const applySelectedStyle = useCallback((streetKey: string, selected: boolean) => {
    if (!layerRef.current) return;
    
    const featureIds = featureIndex.get(streetKey);
    if (!featureIds) return;
    
    console.log(`🎨 Applying ${selected ? 'selected' : 'unselected'} style to ${featureIds.size} segments of street: ${streetKey}`);
    
    featureIds.forEach(featureId => {
      try {
        if (selected) {
          layerRef.current?.setFeatureStyle(featureId, getSelectedStyle());
        } else {
          layerRef.current?.resetFeatureStyle(featureId);
        }
      } catch (error) {
        console.warn('⚠️ Failed to style feature:', featureId, error);
      }
    });
  }, [featureIndex, getSelectedStyle]);

  // Handle street click - attached to VectorGrid layer
  const handleStreetClick = useCallback((e: any) => {
    console.log('🖱️ CLICK EVENT:', {
      zoom: currentZoom,
      layerName: e.layerName,
      hasLayer: !!e.layer,
      layerProperties: e.layer?.properties,
      featureProperties: e.layer?.feature?.properties,
      event: e
    });

    // Check if this is from transportation_name layer (preferred for clicks)
    if (e.layerName !== 'transportation_name') {
      console.log('⚠️ Click not from transportation_name layer:', e.layerName);
      // Still process if it has the right properties
    }

    // Read street name from properties
    const properties = e.layer?.properties || e.layer?.feature?.properties;
    if (!properties) {
      console.log('❌ No properties found in click event');
      return;
    }

    const name = properties.name || properties['name:latin'];
    if (!name) {
      console.log('❌ Street has no name, properties:', properties);
      onError?.('Street has no name');
      return;
    }

    // Update HUD with last clicked street
    const hudElement = document.querySelector('.vector-tiles-hud');
    if (hudElement) {
      hudElement.innerHTML = `
        <div>tiles: vector=${vectorTilesStatus}</div>
        <div>lastVectorHit: ${name}</div>
        <div>layer: ${e.layerName || 'unknown'}</div>
      `;
    }

    const adminArea = properties.place || properties.admin_level;
    const streetKey = makeStreetKey(name, adminArea);
    const displayName = adminArea ? `${name}, ${adminArea}` : name;

    console.log('🏷️ Street key:', streetKey, 'Display name:', displayName);

    setSelectedKeys(prev => {
      const newSelectedKeys = new Set(prev);
      const isSelected = newSelectedKeys.has(streetKey);
      
      console.log('🔄 Toggle selection:', isSelected ? 'UNSELECT' : 'SELECT', 'Current count:', newSelectedKeys.size);
      
      if (isSelected) {
        // Unselect
        newSelectedKeys.delete(streetKey);
        setSelectedDisplayNames(prevNames => {
          const newNames = new Map(prevNames);
          newNames.delete(streetKey);
          return newNames;
        });
      } else if (newSelectedKeys.size < 5) {
        // Select
        newSelectedKeys.add(streetKey);
        setSelectedDisplayNames(prevNames => {
          const newNames = new Map(prevNames);
          newNames.set(streetKey, displayName);
          return newNames;
        });
      } else {
        // Max reached - show toast
        console.log('❌ Max streets reached');
        onError?.('Maximum 5 streets allowed. Please deselect a street first.');
        return prev;
      }
      
      console.log('✅ Selected keys count:', newSelectedKeys.size);
      
      // Trigger redraw to update styling
      if (layerRef.current) {
        layerRef.current.redraw();
        console.log('🔄 Called redraw() to update styling');
      }
      
      // Emit normalized selection after state update
      const newDisplayNames = Array.from(selectedDisplayNames.values());
      if (!isSelected && newSelectedKeys.size < 5) {
        // Add the new selection
        newDisplayNames.push(displayName);
      } else if (isSelected) {
        // Remove the deselected item
        const index = newDisplayNames.indexOf(displayName);
        if (index > -1) {
          newDisplayNames.splice(index, 1);
        }
      }
      
      // Emit only if selection changed
      emitSelectionChange(newDisplayNames);
      
      return newSelectedKeys;
    });
  }, [currentZoom, onError, emitSelectionChange, selectedDisplayNames, vectorTilesStatus]);

  // Initialize vector layer or GeoJSON fallback
  useEffect(() => {
    if (!mapRef.current) return;

    const initializeVectorLayer = async () => {
      try {
        // 7) Fallback A/B to isolate issue
        if (isDebugMode) {
          console.log('🔧 DEBUG MODE: Using GeoJSON fallback');
          await initializeGeoJSONFallback();
          return;
        }
        
        console.log('🚀 Initializing VectorGrid with URL:', vectorTilesUrl);
        
        // 2) Mount VectorGrid - Create dual-layer configuration for transportation and transportation_name
        const vectorLayer = L.vectorGrid.protobuf(vectorTilesUrl, {
          attribution: '© OpenMapTiles © OpenStreetMap contributors',
          maxZoom: 18,
          minZoom: 0,
          interactive: true,
          
          // Stable feature ID using OSM ID
          getFeatureId: (f: any) => {
            const id = f.properties.osm_id || f.properties.id || f.properties.osm_way_id || f.id;
            console.log('🆔 getFeatureId called:', { id, properties: f.properties });
            return id;
          },
          
          // Layer-specific styling
          style: (feature: VectorTileFeature, layerName: string) => {
            console.log('🎨 Style called for layer:', layerName, 'feature:', feature.properties);
            
            // transportation_name layer - transparent wide hit area
            if (layerName === 'transportation_name') {
              return {
                weight: 18,
                color: 'transparent',
                opacity: 0,
                fillOpacity: 0,
                interactive: true
              };
            }
            
            // transportation layer - visible roads with selection styling
            if (layerName === 'transportation') {
              const roadClass = feature.properties.class;
              const allowedClasses = ['residential', 'living_street', 'unclassified', 'service', 'tertiary', 'secondary', 'primary'];
              const hasName = feature.properties.name || feature.properties['name:latin'];
              
              if (!allowedClasses.includes(roadClass) || !hasName) {
                return { opacity: 0 };
              }
              
              // Check if this street is selected
              const name = feature.properties.name || feature.properties['name:latin'];
              const adminArea = feature.properties.place || feature.properties.admin_level;
              const streetKey = makeStreetKey(name, adminArea);
              const isSelected = selectedKeys.has(streetKey);
              
              return isSelected ? getSelectedStyle() : getBaseStyle();
            }
            
            // Hide other layers
            return { opacity: 0 };
          },
          
          // Filter to only show transportation layers
          filter: (feature: VectorTileFeature, layerName: string) => {
            if (layerName === 'transportation_name') {
              // Show all transportation_name features for hit detection
              return true;
            }
            if (layerName === 'transportation') {
              // Show only named roads in allowed classes
              return filterRoads(feature);
            }
            return false;
          },
        });
        
        console.log('✅ VectorGrid.Protobuf created with URL:', vectorTilesUrl);

        console.log('✅ VectorGrid layer created:', vectorLayer);

        // 2) Attach click handler to the VectorGrid layer
        vectorLayer.on('click', (e: any) => {
          console.log('🎯 VectorGrid click handler fired!');
          handleStreetClick(e);
        });
        
        // Also try attaching to specific events
        vectorLayer.on('featureclick', (e: any) => {
          console.log('🎯 VectorGrid featureclick handler fired!');
          handleStreetClick(e);
        });

        // Add event listeners
        vectorLayer.on('tileload', (e: any) => {
          console.log('✅ Vector tile loaded successfully:', e.url);
          setVectorTilesStatus('OK');
          setTileUrls(prev => [...prev.slice(-2), e.url]); // Keep last 3 URLs
          handleTileLoad(e);
        });
        vectorLayer.on('tileerror', (e: any) => {
          console.warn('❌ Vector tile error:', e);
          setVectorTilesStatus('FAIL');
        });
        
        // Add to map on a higher pane to receive clicks
        vectorLayer.addTo(mapRef.current);
        layerRef.current = vectorLayer;
        
        console.log('✅ VectorGrid layer added to map');
        
        // 6) Pane/Z-index/CSS - Ensure vector layer is on top
        const vectorPane = vectorLayer.getPane();
        if (vectorPane) {
          vectorPane.style.zIndex = '650';
          vectorPane.style.pointerEvents = 'auto';
          console.log('✅ Vector layer z-index set to 650, pointer events enabled');
        }
        
        // Bring VectorGrid to front
        vectorLayer.bringToFront();
        console.log('✅ VectorGrid brought to front');

        // Map reference is already stored and zoom listener is set in the other useEffect

        return () => {
          if (layerRef.current) {
            mapRef.current?.removeLayer(layerRef.current);
            layerRef.current = null;
          }
        };
      } catch (error) {
        console.error('Error initializing vector layer:', error);
        onError?.('Vector tiles not available. Please check your connection and try again.');
      }
    };

    initializeVectorLayer();
  }, [vectorTilesUrl, getBaseStyle, getSelectedStyle, getHitStyle, filterRoads, handleStreetClick, handleTileLoad, selectedKeys, onError]);

  // Expose map reference to parent and initialize zoom
  useEffect(() => {
    const map = document.querySelector('.leaflet-container')?.closest('.leaflet-map') as any;
    if (map && map._leaflet_id) {
      mapRef.current = L.Map.prototype.get(map._leaflet_id);
      
      // Initialize zoom state
      if (mapRef.current) {
        const initialZoom = mapRef.current.getZoom();
        setCurrentZoom(initialZoom);
        
        // Add zoom change listener
        mapRef.current.on('zoomend', () => {
          const newZoom = mapRef.current?.getZoom() || 6;
          setCurrentZoom(newZoom);
        });
      }
    }
  }, []);

  // Reset function for parent to call
  const reset = useCallback(() => {
    setSelectedKeys(new Set());
    setSelectedDisplayNames(new Map());
    setFeatureIndex(new Map());
    selectedRef.current = [];
    emitSelectionChange([]);
  }, [emitSelectionChange]);

  // Remove specific street function
  const removeStreet = useCallback((displayName: string) => {
    // Find the street key by display name
    for (const [key, name] of selectedDisplayNames.entries()) {
      if (name === displayName) {
        setSelectedKeys(prev => {
          const newKeys = new Set(prev);
          newKeys.delete(key);
          return newKeys;
        });
        setSelectedDisplayNames(prev => {
          const newNames = new Map(prev);
          newNames.delete(key);
          return newNames;
        });
        applySelectedStyle(key, false);
        
        // Emit updated selection
        const updatedNames = Array.from(selectedDisplayNames.values()).filter(n => n !== displayName);
        emitSelectionChange(updatedNames);
        break;
      }
    }
  }, [selectedDisplayNames, applySelectedStyle, emitSelectionChange]);

  // Expose functions to parent
  useEffect(() => {
    (window as any).streetVectorLayerReset = reset;
    (window as any).streetVectorLayerRemoveStreet = removeStreet;
  }, [reset, removeStreet]);

  // Zoom HUD (top-left) and Vector tiles HUD (bottom-right)
  return (
    <>
      {/* Zoom HUD - Top Left */}
      <div className="zoom-hud absolute top-4 left-4 bg-black/80 text-white text-xs p-2 rounded z-[2000] font-mono">
        <div>Zoom: {currentZoom.toFixed(1)}</div>
        <div>Status: ✅ pickable</div>
      </div>
      
      {/* Vector Tiles HUD - Bottom Right */}
      <div className="vector-tiles-hud absolute bottom-4 right-4 bg-black/80 text-white text-xs p-2 rounded z-[2000] font-mono">
        <div>tiles: vector={vectorTilesStatus}</div>
        {tileUrls.length > 0 && (
          <div className="mt-1">
            <div>URLs:</div>
            {tileUrls.slice(-3).map((url, i) => (
              <div key={i} className="text-xs opacity-75">
                {url.split('/').slice(-3).join('/')}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
