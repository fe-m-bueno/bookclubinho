/**
 * O toggle de tema vive dentro do card (ver `OnboardingWizard`), não solto no
 * canto: em 375px o card ocupa a largura toda e um botão `absolute` no canto
 * superior direito cobria o último passo do indicador de progresso.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      {children}
    </div>
  );
}
