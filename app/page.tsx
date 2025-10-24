'use client';

import { useState, useEffect } from 'react';
import GooglePlacesAutocomplete from '../components/GooglePlacesAutocomplete';

interface PropertyData {
  address: string;
  oppervlakte: number | '';
  kamers: number | '';
  slaapkamers: number | '';
  badkamers: number | '';
  energielabel: string;
  tuin: string;
  dakterras_balkon: string;
}


export default function Home() {
  const [propertyData, setPropertyData] = useState<PropertyData>({
    address: '',
    oppervlakte: '',
    kamers: '',
    slaapkamers: '',
    badkamers: '',
    energielabel: '',
    tuin: '',
    dakterras_balkon: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Load saved data from localStorage on component mount
  useEffect(() => {
    const savedData = localStorage.getItem('propertyData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setPropertyData(parsedData);
      } catch (error) {
        console.error('Error parsing saved property data:', error);
      }
    }
  }, []);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    const selectedAddress = place.formatted_address || place.name || '';
    setPropertyData(prev => ({ ...prev, address: selectedAddress }));
    console.log('Selected place:', place);
  };

  const handleInputChange = (field: keyof PropertyData, value: string | number) => {
    setPropertyData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field] || errors.general) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        delete newErrors.general;
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    if (!propertyData.address.trim()) {
      newErrors.address = 'Adres is verplicht';
    }
    if (!propertyData.oppervlakte || propertyData.oppervlakte <= 0) {
      newErrors.oppervlakte = 'Oppervlakte is verplicht en moet groter zijn dan 0';
    }
    if (!propertyData.kamers || propertyData.kamers <= 0) {
      newErrors.kamers = 'Aantal kamers is verplicht en moet groter zijn dan 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any previous general errors
    if (errors.general) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.general;
        return newErrors;
      });
    }
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    try {
      // Save property data to localStorage
      localStorage.setItem('propertyData', JSON.stringify(propertyData));
      
      // Send address to API for geocoding
      const response = await fetch('/api/address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: propertyData.address.trim() }),
      });

      const data = await response.json();
      console.log('Response:', data);
      
      // Check if response has error property
      if (data.error) {
        console.error('API Error:', data.error);
        setErrors({ general: data.error });
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
      
    } catch (error) {
      console.error('Error:', error);
      setErrors({ general: 'Er is een fout opgetreden bij het verwerken van uw aanvraag. Probeer het opnieuw.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-gray-800 rounded-2xl shadow-lg p-10 max-w-4xl w-full mx-4">
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-white text-center">
            AI Vastgoedanalyse
          </h1>
          <p className="text-gray-300 text-center">
            Vul de eigenschappen van uw woning in voor een uitgebreide analyse.
          </p>
          
          {errors.general && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
              <p className="text-red-400 text-sm">{errors.general}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Address Field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Adres *
              </label>
              <GooglePlacesAutocomplete
                onPlaceSelect={handlePlaceSelect}
                placeholder="Voer adres in..."
                disabled={isLoading}
                value={propertyData.address}
                onChange={(value) => handleInputChange('address', value)}
              />
              {errors.address && (
                <p className="text-red-400 text-sm">{errors.address}</p>
              )}
            </div>

            {/* Property Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Oppervlakte */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Oppervlakte (m²) *
                </label>
                <input
                  type="number"
                  value={propertyData.oppervlakte}
                  onChange={(e) => handleInputChange('oppervlakte', parseInt(e.target.value) || '')}
                  placeholder="Bijv. 85"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
                {errors.oppervlakte && (
                  <p className="text-red-400 text-sm">{errors.oppervlakte}</p>
                )}
              </div>

              {/* Kamers */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Aantal kamers *
                </label>
                <input
                  type="number"
                  value={propertyData.kamers}
                  onChange={(e) => handleInputChange('kamers', parseInt(e.target.value) || '')}
                  placeholder="Bijv. 4"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
                {errors.kamers && (
                  <p className="text-red-400 text-sm">{errors.kamers}</p>
                )}
              </div>

              {/* Slaapkamers */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Slaapkamers
                </label>
                <input
                  type="number"
                  value={propertyData.slaapkamers}
                  onChange={(e) => handleInputChange('slaapkamers', parseInt(e.target.value) || '')}
                  placeholder="Bijv. 2"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
              </div>

              {/* Badkamers */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Badkamers
                </label>
                <input
                  type="number"
                  value={propertyData.badkamers}
                  onChange={(e) => handleInputChange('badkamers', parseInt(e.target.value) || '')}
                  placeholder="Bijv. 1"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
              </div>

              {/* Energielabel */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Energielabel
                </label>
                <select
                  value={propertyData.energielabel}
                  onChange={(e) => handleInputChange('energielabel', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                >
                  <option value="">Selecteer energielabel</option>
                  <option value="A+">A+</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                  <option value="F">F</option>
                  <option value="G">G</option>
                </select>
              </div>

              {/* Tuin */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Tuin
                </label>
                <select
                  value={propertyData.tuin}
                  onChange={(e) => handleInputChange('tuin', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                >
                  <option value="">Selecteer optie</option>
                  <option value="Ja">Ja</option>
                  <option value="Nee">Nee</option>
                </select>
              </div>

              {/* Dakterras/Balkon */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Dakterras/Balkon
                </label>
                <select
                  value={propertyData.dakterras_balkon}
                  onChange={(e) => handleInputChange('dakterras_balkon', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                >
                  <option value="">Selecteer optie</option>
                  <option value="Ja">Ja</option>
                  <option value="Nee">Nee</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
            >
              {isLoading ? 'Bezig...' : 'Volgende'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}