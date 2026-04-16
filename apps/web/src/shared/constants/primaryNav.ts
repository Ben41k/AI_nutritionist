export const PRIMARY_NAV = {
  metrics: {
    to: '/',
    navLabel: 'Метрики',
    pageTitle: 'Метрики',
    description: 'Вес, вода, калории и динамика относительно вашей цели.',
    icon: 'chart',
  },
  meals: {
    to: '/meals',
    navLabel: 'Дневник',
    pageTitle: 'Дневник питания',
    description: 'Записи приёмов пищи и калорийность по дням.',
    icon: 'meal',
  },
  ration: {
    to: '/ration',
    navLabel: 'Рацион',
    pageTitle: 'Рацион',
    description: 'Примерный план питания на месяц, который можно пересобрать.',
    icon: 'ration',
  },
  chat: {
    to: '/chat',
    navLabel: 'Чат',
    pageTitle: 'Чат с AI',
    description: 'Вопросы по питанию, режиму и привычкам — в свободной форме.',
    icon: 'chat',
  },
} as const;

export const PRIMARY_NAV_ITEMS = [
  PRIMARY_NAV.metrics,
  PRIMARY_NAV.meals,
  PRIMARY_NAV.ration,
  PRIMARY_NAV.chat,
] as const;

export type PrimaryNavIcon = (typeof PRIMARY_NAV_ITEMS)[number]['icon'];
