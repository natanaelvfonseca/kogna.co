// Camada que simula chamadas à API real. Pronta para ser substituída por fetch().
import * as mock from "./mock-data";

const delay = <T,>(data: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(data), ms));

export const mockApi = {
  getDashboardData: () => delay({ escola: mock.escola, kpis: mock.dashboardKPIs, recomendacoes: mock.recomendacoesMel }),
  getLeads: () => delay(mock.leads),
  getConversations: () => delay(mock.conversas),
  getConversation: (id: string) => delay(mock.conversas.find((c) => c.id === id)),
  getAlerts: () => delay(mock.alertas),
  getTasks: () => delay(mock.tarefas),
  getCourses: () => delay(mock.cursos),
  getSalespeople: () => delay(mock.vendedores),
  getMarketingData: () => delay(mock.campanhas),
  getLouCommands: () => delay(mock.comandosLou),
  getMissions: () => delay(mock.missoes),
  getAchievements: () => delay(mock.conquistas),
};
