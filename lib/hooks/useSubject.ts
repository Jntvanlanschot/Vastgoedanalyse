'use client';

import { useState, useEffect } from 'react';

interface SubjectData {
  lat: number;
  lng: number;
  city: string;
  address: string;
}

export function useSubject(): SubjectData | null {
  const [subject, setSubject] = useState<SubjectData | null>(null);

  useEffect(() => {
    // Try to get address data from sessionStorage first
    const storedAddress = sessionStorage.getItem('selectedAddress');
    const storedGeo = sessionStorage.getItem('addressGeo');
    
    if (storedAddress && storedGeo) {
      try {
        const geo = JSON.parse(storedGeo);
        setSubject({
          lat: geo.lat,
          lng: geo.lng,
          city: geo.city,
          address: storedAddress
        });
        return;
      } catch (error) {
        console.error('Error parsing stored geo data:', error);
      }
    }
    
    // Fallback to mock data if no stored address
    setSubject({
      lat: 52.3676, // Amsterdam center
      lng: 4.9041,
      city: 'Amsterdam',
      address: 'Damrak 1, 1012 JS Amsterdam'
    });
  }, []);

  return subject;
}


