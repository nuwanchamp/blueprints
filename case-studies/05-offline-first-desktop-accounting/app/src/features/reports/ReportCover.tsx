import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export interface CoverSection {
  title: string
  page: number | null
}

/**
 * The first page of a printed or saved report, on cream paper: a painting on the left, the Daybook logo, the
 * title, the period and the contents with page numbers. A full A4 sheet (see index.css).
 * It is placed at the very start of the document, ahead of the app and its page margins, so it fills its sheet.
 */
export function ReportCover(props: { period: string; sections: CoverSection[] }) {
  const [host] = useState(() => document.createElement('div'))
  useLayoutEffect(() => {
    document.body.prepend(host)
    return () => host.remove()
  }, [host])
  return createPortal(<Cover {...props} />, host)
}

function Cover({ period, sections }: { period: string; sections: CoverSection[] }) {
  const { t } = useTranslation()
  return (
    <div className="report-cover hidden print:block" data-testid="report-cover">
      {/* multiply: the painting's own light paper takes the cover's cream, its ink and colours stay */}
      <img src="/assets/report-cover-painting.jpg" alt="" className="absolute top-0 left-0 h-full w-[102mm] object-cover object-left mix-blend-multiply" />
      <div className="absolute top-0 left-[84mm] flex h-[56mm] w-[49mm] items-center justify-center bg-[#2b2623]">
        <img src="/assets/dark-logo.jpg" alt="Daybook" className="w-[46mm]" />
      </div>
      <p aria-hidden className="absolute top-[22mm] right-[13mm] flex flex-col items-center rounded-[1.2mm] border-[0.45mm] border-[#b4433a] px-[1mm] py-[0.8mm] font-serif text-[4.2mm] leading-[1.1] text-[#b4433a]">
        <span>日</span>
        <span>账</span>
      </p>

      <div className="absolute top-[104mm] right-[16mm] left-[103mm] text-ink">
        <p className="font-serif text-[5.6mm] leading-tight tracking-wide uppercase">{t('reports.cover.kicker')}</p>
        <p className="font-serif text-[19mm] leading-none font-semibold tracking-tight uppercase">{t('reports.cover.title')}</p>
        <p className="mt-[5mm] text-[3.6mm] leading-snug font-medium">{period}</p>
      </div>

      <div className="absolute top-[198mm] right-[16mm] left-[103mm] text-ink">
        <p className="font-serif text-[6.6mm] uppercase">{t('reports.contents')}</p>
        <ol className="mt-[4mm] flex flex-col gap-[4.2mm] text-[4.4mm]">
          {sections.map((s) => (
            <li key={s.title} className="flex items-baseline gap-[1.5mm]">
              <span>{s.title}</span>
              <span aria-hidden className="flex-1 translate-y-[-0.8mm] border-b-[0.5mm] border-dotted border-ink/60" />
              <span className="tabular-nums">{s.page ?? ''}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
