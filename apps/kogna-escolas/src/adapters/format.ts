export function formatRelativeDate(value?: string | null) {
  if (!value) return "Sem interação";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min atrás`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;

  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 8) return `${days} dias atrás`;

  return date.toLocaleDateString("pt-BR");
}

export function formatDueDate(value?: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = date.toDateString() === today.toDateString();
  const tomorrowDay = date.toDateString() === tomorrow.toDateString();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (sameDay) return `Hoje ${time}`;
  if (tomorrowDay) return `Amanhã ${time}`;
  return `${date.toLocaleDateString("pt-BR")} ${time}`;
}

export function initialsFromName(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "KG"
  );
}

export function normalizePriority(value?: string | null) {
  const priority = (value || "media").toLowerCase();
  if (priority === "crítica") return "critica";
  if (["baixa", "media", "alta", "critica"].includes(priority)) return priority;
  return "media";
}

export function normalizeTemperature(value?: string | null) {
  const temperature = (value || "frio").toLowerCase();
  if (["frio", "morno", "quente"].includes(temperature)) return temperature;
  if (temperature === "hot") return "quente";
  if (temperature === "warm") return "morno";
  return "frio";
}
