export default function ClientDashboard() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold mb-4">Painel do Cliente</h1>
      <ul className="list-disc pl-6 space-y-2">
        <li>Feedback diário</li>
        <li>Feedback semanal</li>
        <li>Check-ins</li>
        <li>Planos (PDFs)</li>
      </ul>
    </main>
  );
}
