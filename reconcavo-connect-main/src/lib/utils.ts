import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// supabase-js só expõe uma mensagem genérica ("Edge Function returned a
// non-2xx status code") em error.message quando a function responde 4xx/5xx;
// o corpo JSON de verdade fica em error.context (a Response da chamada).
export async function extractFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body?.message) return String(body.message);
    } catch {
      /* corpo não era JSON, usa fallback */
    }
  }
  return (error as { message?: string })?.message ?? fallback;
}
