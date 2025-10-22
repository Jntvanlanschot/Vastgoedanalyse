'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import StreetVectorLayer from './StreetVectorLayer';

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

interface MapComponentProps {
  lat: number;
  lng: number;
  selectedStreets: string[];
  onStreetSelectionChange: (selectedStreets: string[]) => void;
  onError?: (error: string) => void;
}

// Component to handle map fly-to functionality
function MapController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    // Fly to subject location after map loads
    setTimeout(() => {
      map.flyTo([lat, lng], 14, {
        duration: 2
      });
    }, 1000);
  }, [map, lat, lng]);

  return null;
}

export default function MapComponent({ lat, lng, selectedStreets, onStreetSelectionChange, onError }: MapComponentProps) {

  return (
    <MapContainer
      center={[52.2, 5.3]} // Center on Netherlands
      zoom={6}
      style={{ height: '100%', width: '100%' }}
      className="rounded-b-lg"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      <MapController lat={lat} lng={lng} />
      
      <StreetVectorLayer
        onStreetSelectionChange={onStreetSelectionChange}
        onError={onError}
      />
    </MapContainer>
  );
}
