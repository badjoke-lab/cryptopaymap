"use client";

export default function Disclaimer() {
  return (
    <main className="pt-[var(--header-h,64px)] mx-auto max-w-6xl px-4 md:px-6 py-10 space-y-8">
      {/* タイトル */}
      <section className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">Disclaimer</h1>
      </section>

      {/* 本文 */}
      <section className="space-y-4">
        <p className="text-[15px] leading-relaxed text-gray-700">
          This website is provided for informational and educational purposes
          only. It does not constitute financial, investment, or legal advice.
          Always conduct your own research before making decisions involving
          cryptocurrencies or related technologies.
        </p>

        <p className="text-[15px] leading-relaxed text-gray-700">
          While we strive to ensure accuracy, no guarantee is made as to the
          completeness, timeliness, or reliability of the data displayed. All
          content is provided “as is,” without warranty of any kind.
        </p>

        <p className="text-[15px] leading-relaxed text-gray-700">
          We are not liable for any losses, damages, or issues arising from the
          use of this site or reliance on its content. Users assume full
          responsibility for their actions and any resulting consequences.
        </p>

        <p className="text-[15px] leading-relaxed text-gray-700">
          External links may direct you to third-party services or resources. We
          do not endorse and are not responsible for the content, products, or
          services provided by third parties.
        </p>

        <p className="text-[15px] leading-relaxed text-gray-700">
          By using this site, you acknowledge and accept this disclaimer in full.
        </p>
      </section>
    </main>
  );
}
