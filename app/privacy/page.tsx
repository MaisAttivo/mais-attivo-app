export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-6">
        <h1 className="text-2xl font-semibold mb-2">Política de Privacidade (RGPD) e Utilização de Imagem</h1>
        <p className="text-sm text-slate-700 mb-3">
          Tratamos os teus dados pessoais de acordo com o Regulamento Geral de Proteção de Dados (RGPD) e a legislação portuguesa aplicável. Apenas recolhemos os dados necessários para prestação do serviço e melhoria da tua experiência, mantendo-os seguros e por tempo limitado.
        </p>

        <h2 className="text-lg font-semibold mt-4 mb-1">Consentimentos necessários</h2>
        <ul className="list-disc ml-5 text-sm text-slate-700 space-y-1">
          <li>Termos &amp; Privacidade: aceitação obrigatória para criação de conta.</li>
          <li>Consentimento explícito para tratamento de dados de saúde: obrigatório e separado, podendo ser retirado a qualquer momento.</li>
        </ul>

        <h2 id="legal-bases" className="text-lg font-semibold mt-6 mb-1">Bases legais</h2>
        <p className="text-sm text-slate-700">
          Execução do contrato e interesse legítimo para operação da app e segurança; <strong>consentimento explícito</strong> para dados de saúde; consentimento separado para marketing e <strong>utilização de imagem</strong>.
        </p>

        <h2 id="minors" className="text-lg font-semibold mt-6 mb-1">Menores</h2>
        <p className="text-sm text-slate-700">
          Idade mínima: o serviço destina‑se a pessoas com 13+ anos (Lei 58/2019). Menores de 13 anos só com consentimento dos representantes legais.
        </p>

        <h2 id="security" className="text-lg font-semibold mt-6 mb-1">Segurança</h2>
        <p className="text-sm text-slate-700">
          Usamos Firebase (Google) com dados em repouso e em trânsito encriptados, controlo de acessos por perfis (cliente/coach), autenticação com MFA para a equipa, registo de acessos e formação/confidencialidade dos coaches.
        </p>

        <h2 id="notifications" className="text-lg font-semibold mt-6 mb-1">Notificações &amp; marketing</h2>
        <ul className="list-disc ml-5 text-sm text-slate-700 space-y-2">
          <li><strong>Notificações push (OneSignal):</strong> opt‑in do utilizador; marketing só com consentimento, podendo ser gerido nas Definições.</li>
          <li><strong>Cookies/analytics:</strong> se usarmos analytics ou push que criem cookies, será apresentada nota de cookies (básica) e só serão usados após consentimento (quando aplicável).</li>
        </ul>

        <h2 id="image-usage" className="text-lg font-semibold mt-6 mb-1">Utilização de Imagem (opt‑in)</h2>
        <p className="text-sm text-slate-700">
          Para fins de marketing/divulgação, a utilização da tua imagem (fotos/vídeos) exige <strong>consentimento explícito, livre e separado</strong>. Este consentimento será pedido mais tarde, no contexto certo (por exemplo, quando nos enviares/autorizar fotos ou testemunhos), através de um modal simples. É opcional e podes retirar o consentimento a qualquer momento.
        </p>
        <p className="text-sm text-slate-700 mt-2">
          As imagens ficam armazenadas em <strong>Firebase Storage</strong>; só são publicadas após consentimento e o utilizador pode retirar o consentimento nas Definições. Quando consentires, poderás escolher opções como <em>ocultar rosto</em> ou autorizar apenas <em>antes‑depois anónimo</em>.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-1">Informação adicional (à prova de auditoria)</h2>
        <ul className="list-disc ml-5 text-sm text-slate-700 space-y-2">
          <li>
            <strong>Responsável pelo tratamento:</strong> Mais Attivo. Contacto: <a className="underline" href="mailto:maisattivo.geral@gmail.com">maisattivo.geral@gmail.com</a>.
          </li>
          <li>
            <strong>Subprocessadores:</strong> Firebase (Google), Vercel, OneSignal, Builder.io (entre outros necessários à operação do serviço). Celebrámos DPAs com estes fornecedores e usamos SCCs quando há transferências fora da UE.
          </li>
          <li>
            <strong>Transferências fora da UE:</strong> quando aplicável, baseadas nas Standard Contractual Clauses (SCCs) e Acordos de Processamento de Dados (DPAs) com esses fornecedores.
          </li>
          <li>
            <strong>Conservação:</strong> dados de acompanhamento por até 3 anos após o fim do serviço; dados de faturação por 10 anos; registos de consentimentos enquanto vigentes + 5 anos; imagens mantidas apenas enquanto houver consentimento e até retirada do mesmo.
          </li>
          <li>
            <strong>Reclamações:</strong> manténs todos os direitos RGPD. Podes apresentar reclamação à CNPD em <a className="underline" href="https://www.cnpd.pt/" target="_blank" rel="noopener noreferrer">www.cnpd.pt</a>. Email de privacidade: <a className="underline" href="mailto:maisattivo.geral@gmail.com">maisattivo.geral@gmail.com</a>.
          </li>
        </ul>

        <div className="text-xs text-slate-500 mt-4">Versão da política: v1.0 — 03/09/2025</div>

        <h2 className="text-lg font-semibold mt-6 mb-1">Direitos do Titular</h2>
        <p className="text-sm text-slate-700">
          Tens direito de acesso, retificação, portabilidade e apagamento dos dados, bem como oposição e limitação do tratamento. Para exercer estes direitos, contacta-nos pelos canais habituais.
        </p>

        <h2 className="text-lg font-semibold mt-4 mb-1">Contacto e DPO</h2>
        <p className="text-sm text-slate-700">
          Para questões sobre privacidade, entra em contacto com o nosso suporte. Se preferires, podes solicitar o contacto do Encarregado de Proteção de Dados (DPO).
        </p>
      </div>
    </main>
  );
}
