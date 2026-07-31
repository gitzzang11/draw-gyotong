export interface NewsItem {
  id: string;
  read: boolean;
}

export class NewsService<T extends NewsItem> {
  constructor(private readonly maximumItems = 80) {}

  append(items: readonly T[], item: T): T[] {
    if (items.some((existing) => existing.id === item.id)) return [...items];
    return [...items, item].slice(-this.maximumItems);
  }

  markRead(items: readonly T[], id: string): T[] {
    return items.map((item) => item.id === id ? { ...item, read: true } : item);
  }

  unreadCount(items: readonly T[]): number {
    return items.filter((item) => !item.read).length;
  }
}
