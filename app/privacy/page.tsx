export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-6">
        <h1 className="text-2xl font-semibold mb-2">Política de Privacidade (RGPD) e Utilização de Imagem</h1>
        <p className="text-sm text-slate-700 mb-3">
          Tratamos os teus dados pessoais de acordo com o Regulamento Geral de Proteção de Dados (RGPD) e a legislação portuguesa aplicável. Apenas recolhemos os dados necessários para prestação do serviço e melhoria da tua experiência, mantendo-os seguros e por tempo limitado.
        </p>
        <h2 className="text-lg font-semibold mt-4 mb-1">Direitos do Titular</h2>
        <p className="text-sm text-slate-700">
          Tens direito de acesso, retificação, portabilidade e apagamento dos dados, bem como oposição e limitação do tratamento. Para exercer estes direitos, contacta-nos pelos canais habituais.
        </p>
        <h2 id="image-usage" className="text-lg font-semibold mt-4 mb-1">Utilização de Imagem</h2>
        <p className="text-sm text-slate-700">
          Todas as imagens que nos enviares são privadas. Poderão ser utilizadas nas redes sociais apenas com a cara censurada (por exemplo, desfocada), salvo indicação expressa em contrário por tua parte. Podes retirar o consentimento a qualquer momento.
        </p>
        <h2 className="text-lg font-semibold mt-4 mb-1">Contacto e DPO</h2>
        <p className="text-sm text-slate-700">
          Para questões sobre privacidade, entra em contacto com o nosso suporte. Se preferires, podes solicitar o contacto do Encarregado de Proteção de Dados (DPO).
        </p>
      </div>
    </main>
  );
}
