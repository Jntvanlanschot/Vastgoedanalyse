export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">404</h1>
        <p className="text-gray-300 mb-8">Pagina niet gevonden</p>
        <a
          href="/"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Terug naar home
        </a>
      </div>
    </div>
  );
}

