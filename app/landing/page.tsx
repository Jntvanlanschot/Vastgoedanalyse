'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
      });

      if (response.ok) {
        // Redirect to login page after successful logout
        router.push('/login');
      } else {
        console.error('Logout failed');
        // Still redirect to login even if logout fails
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect to login even if logout fails
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleStartAnalysis = () => {
    router.push('/');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-gray-800 rounded-2xl shadow-lg p-10 max-w-4xl w-full mx-4">
        {/* Header with logout button */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            Welkom bij Vastgoedanalyse
          </h1>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            {isLoggingOut ? 'Uitloggen...' : 'Uitloggen'}
          </button>
        </div>

        <div className="space-y-8">
          {/* Welcome message */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white mb-4">
              U bent succesvol ingelogd
            </h2>
            <p className="text-gray-300 text-lg">
              U heeft nu toegang tot de volledige functionaliteit van de Vastgoedanalyse tool.
            </p>
          </div>

          {/* Main content */}
          <div className="bg-gray-700 rounded-lg p-8">
            <h3 className="text-xl font-semibold text-white mb-4">
              Wat kunt u doen?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-blue-400">
                  🏠 Eigenschappen Invoeren
                </h4>
                <p className="text-gray-300">
                  Voer de eigenschappen van uw woning in voor een uitgebreide analyse.
                </p>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-blue-400">
                  🗺️ Buurt Analyse
                </h4>
                <p className="text-gray-300">
                  Bekijk de dichtstbijzijnde buurten en hun marktgegevens op een interactieve kaart.
                </p>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-blue-400">
                  📊 Funda Scraping
                </h4>
                <p className="text-gray-300">
                  Start automatische data scraping van Funda voor vergelijkbare woningen.
                </p>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-blue-400">
                  💰 Prijsanalyse
                </h4>
                <p className="text-gray-300">
                  Krijg inzicht in de marktwaarde van uw woning gebaseerd op vergelijkbare objecten.
                </p>
              </div>
            </div>
          </div>

          {/* Call to action */}
          <div className="text-center">
            <button
              onClick={handleStartAnalysis}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-8 rounded-lg transition-colors duration-200 text-lg"
            >
              Start Vastgoedanalyse
            </button>
          </div>

          {/* Additional info */}
          <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-blue-400 mb-2">
              💡 Tip
            </h4>
            <p className="text-gray-300">
              Uw sessie blijft actief voor 30 dagen. U hoeft zich niet opnieuw in te loggen zolang u regelmatig de tool gebruikt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
