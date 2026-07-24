import { AtSign, Camera, Play } from "lucide-react";

import { footerColumns } from "./mockData";

export default function Footer() {
  return (
    <footer className="border-t border-[rgba(170,181,190,.1)] bg-[#0C0C0C] px-6 pb-10 pt-[clamp(48px,7vh,80px)]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-9">
        <div className="col-span-full max-w-[360px]">
          <p className="text-[1.7rem] font-black uppercase tracking-[.14em] text-[#E8EEF2]">PULSE</p>
          <p className="mt-3 text-[.98rem] leading-[1.5] text-[#AAB5BE]">
            La forma moderna de vivir un evento presencial. Registro, entradas digitales y acceso por QR.
          </p>
        </div>
        {footerColumns.map((col) => (
          <div key={col.title}>
            <p className="mb-4 text-[.72rem] font-bold uppercase tracking-[.16em] text-[#7d8790]">{col.title}</p>
            <div className="flex flex-col gap-2.5">
              {col.links.map((link) => (
                <a key={link} href="#top" className="pulse-footer-link text-[.96rem] text-[#AAB5BE]">
                  {link}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-11 flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-[rgba(170,181,190,.1)] pt-6">
        <p className="text-[.86rem] text-[#7d8790]">© 2026 Pulse Event. Datos ficticios · demo visual.</p>
        <div className="flex gap-4">
          <a href="#top" className="pulse-social-link">
            <Camera size={19} />
          </a>
          <a href="#top" className="pulse-social-link">
            <AtSign size={19} />
          </a>
          <a href="#top" className="pulse-social-link">
            <Play size={19} />
          </a>
        </div>
      </div>
    </footer>
  );
}
