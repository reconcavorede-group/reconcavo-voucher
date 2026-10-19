import { useEffect, useState } from "react";
import { COUNTRIES, buildE164, parseE164, formatNational } from "@/lib/phone";

// Campo de telefone internacional: seletor de país (Brasil padrão) + número.
// `value` é o E.164 ("+5575999999999"); `onChange` recebe o E.164 montado.
export function PhoneField({
  value, onChange, inputClassName, selectClassName,
}: {
  value: string;
  onChange: (e164: string) => void;
  inputClassName?: string;
  selectClassName?: string;
}) {
  const init = parseE164(value);
  const [code, setCode] = useState(init.code);
  const [national, setNational] = useState(init.national);

  // Re-sincroniza se o pai mudar o value por fora (ex.: reset após enviar).
  useEffect(() => {
    if (value !== buildE164(code, national)) {
      const p = parseE164(value);
      setCode(p.code);
      setNational(p.national);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setC = (c: string) => { setCode(c); onChange(buildE164(c, national)); };
  const setN = (v: string) => { const d = v.replace(/\D/g, ""); setNational(d); onChange(buildE164(code, d)); };

  return (
    <div className="flex gap-2">
      <select value={code} onChange={(e) => setC(e.target.value)}
        className={selectClassName}
        aria-label="País">
        {COUNTRIES.map((c) => (
          <option key={c.name} value={c.code}>{c.flag} {c.name} (+{c.code})</option>
        ))}
      </select>
      <input
        value={formatNational(code, national)}
        onChange={(e) => setN(e.target.value)}
        placeholder={code === "55" ? "(75) 99999-9999" : "número"}
        inputMode="tel" autoComplete="tel"
        className={inputClassName}
      />
    </div>
  );
}
