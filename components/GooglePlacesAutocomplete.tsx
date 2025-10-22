'use client';

import { useEffect, useRef, useState } from 'react';

interface GooglePlacesAutocompleteProps {
  onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export default function GooglePlacesAutocomplete({
  onPlaceSelect,
  placeholder = "Enter address...",
  className = "",
  disabled = false,
  value = "",
  onChange
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    console.log('API Key loaded:', apiKey ? 'Yes' : 'No');
    console.log('API Key value:', apiKey);
    
    if (!apiKey || apiKey === 'your_api_key_here' || apiKey === 'your_google_maps_api_key_here') {
      console.warn('Google Maps API key not configured - input will work as regular text input');
      setIsLoaded(true); // Enable the input even without API key
      return;
    }

    // Check if Google Maps API is already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      initializeAutocomplete();
      return;
    }

    // Load Google Maps API script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    // Define the callback function
    (window as any).initGoogleMaps = () => {
      console.log('Google Maps API loaded successfully');
      initializeAutocomplete();
    };

    document.head.appendChild(script);

    function initializeAutocomplete() {
      if (inputRef.current && window.google && window.google.maps && window.google.maps.places) {
        console.log('Creating autocomplete instance...');
        
        // Create autocomplete instance with Netherlands bias
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'nl' }, // Restrict to Netherlands
          fields: ['place_id', 'formatted_address', 'geometry', 'name'],
          types: ['address'] // Focus on addresses
        });

        // Listen for place selection
        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current?.getPlace();
          if (place && place.place_id) {
            onPlaceSelect(place);
          }
        });

        setIsLoaded(true);
        console.log('Google Places Autocomplete initialized successfully');
      }
    }

    // Cleanup
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      // Remove the script if it was added
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.remove();
      }
      // Clean up the callback
      if ((window as any).initGoogleMaps) {
        delete (window as any).initGoogleMaps;
      }
    };
  }, [onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled || !isLoaded}
      className={`w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${className}`}
    />
  );
}
